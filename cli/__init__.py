"""Rheoson CLI — a terminal front end for the shared api services.

Importing anything under ``cli`` runs :func:`cli.bootstrap.bootstrap` first, so
a submodule's ``from app.services... import ...`` resolves against
``Rheoson/api`` and against the settings in ``api/.env``.
"""

from cli.bootstrap import bootstrap

bootstrap()

__all__ = ["bootstrap"]
