import re
import subprocess
from pathlib import Path

from app.core.config import settings
from app.tasks import celery_app


def _sanitize(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', '', name).strip()


@celery_app.task(bind=True, name="tasks.download")
def download_track(
    self,
    job_id:        str,
    url:           str,
    fmt:           str,
    playlist_name: str | None = None,
):
    music_dir = Path(settings.MUSIC_DIR)

    if playlist_name:
        folder = music_dir / _sanitize(playlist_name)
    else:
        folder = music_dir

    folder.mkdir(parents=True, exist_ok=True)

    output_template = str(folder / "%(uploader)s" / "%(title)s.%(ext)s")

    cmd = [
        "yt-dlp",
        
        "-f", "bestaudio/best",
        "-x",
        "--audio-format", fmt,
        "--audio-quality", "0",
        "--embed-metadata",
        "--newline",
        "-o", output_template,
        url,
    ]

    self.update_state(state="STARTED", meta={"progress": 0.05, "title": url})

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

        stdout_lines = []
        stderr_lines = []
        title = None

        for line in proc.stdout:
            line = line.strip()
            stdout_lines.append(line)

            if "[download]" in line and "%" in line:
                try:
                    pct = float(line.split("%")[0].split()[-1])
                    self.update_state(
                        state="STARTED",
                        meta={"progress": round(pct / 100, 3), "title": title or url},
                    )
                except ValueError:
                    pass

            if "[ExtractAudio]" in line and "Destination:" in line:
                title = Path(line.split("Destination:")[-1].strip()).stem

        stderr_output = proc.stderr.read()
        proc.wait()

        if proc.returncode != 0:
            # include full stderr so we can see exactly what went wrong
            raise RuntimeError(
                f"yt-dlp exit {proc.returncode}:\n{stderr_output}\n\nSTDOUT:\n" +
                "\n".join(stdout_lines[-20:])
            )

        self.update_state(state="STARTED", meta={"progress": 1.0, "title": title or url})
        return {"job_id": job_id, "status": "complete", "title": title}

    except Exception as exc:
        raise RuntimeError(str(exc)) from exc