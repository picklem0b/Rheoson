import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ArtworkImageProps {
   src?: string | null;
   alt?: string;
   size?: number | string;
   className?: string;
   radius?: string;
   // Shape: 'square' for tracks/albums, 'circle' for artists
   shape?: "square" | "circle";
   // Fallback icon size relative to container
   iconScale?: number;
}

/**
 * ArtworkImage
 *
 * Handles the full lifecycle of a remote image:
 *   1. Shows a skeleton while loading
 *   2. Fades in the image on load
 *   3. Falls back to a music note icon if the URL fails or is empty
 *
 * Previously the app rendered <img src={track.artworkUrl} /> directly.
 * When artworkUrl was empty or returned a 404 (cold Render startup, missing
 * YouTube thumbnail) the browser showed a broken image icon. This component
 * replaces that pattern across the entire app.
 */
export function ArtworkImage({
   src,
   alt = "",
   size,
   className,
   radius = "rounded-xl",
   shape = "square",
   iconScale = 0.4
}: ArtworkImageProps) {
   const [status, setStatus] = useState<"loading" | "loaded" | "error">(
      src ? "loading" : "error"
   );
   const [currentSrc, setCurrentSrc] = useState(src ?? "");
   const imgRef = useRef<HTMLImageElement>(null);

   // Reset when src changes
   useEffect(() => {
      if (!src) {
         setStatus("error");
         setCurrentSrc("");
         return;
      }
      setStatus("loading");
      setCurrentSrc(src);
   }, [src]);

   // Check if image is already cached (instant load — no flicker)
   useEffect(() => {
      if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
         setStatus("loaded");
      }
   }, [currentSrc]);

   const sizeStyle = size ? { width: size, height: size } : undefined;
   const shapeClass = shape === "circle" ? "rounded-full" : radius;

   return (
      <div
         className={cn(
            "relative overflow-hidden flex-shrink-0 bg-[var(--bg-elevated)]",
            shapeClass,
            className
         )}
         style={sizeStyle}>
         {/* Skeleton shimmer while loading */}
         <AnimatePresence>
            {status === "loading" && (
               <motion.div
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className='absolute inset-0 bg-[var(--bg-elevated)]'>
                  <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer' />
               </motion.div>
            )}
         </AnimatePresence>

         {/* Actual image */}
         <AnimatePresence>
            {status !== "error" && currentSrc && (
               <motion.img
                  ref={imgRef}
                  key={currentSrc}
                  src={currentSrc}
                  alt={alt}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: status === "loaded" ? 1 : 0 }}
                  transition={{ duration: 0.25 }}
                  onLoad={() => setStatus("loaded")}
                  onError={() => setStatus("error")}
                  className='absolute inset-0 w-full h-full object-cover'
                  draggable={false}
               />
            )}
         </AnimatePresence>

         {/* Fallback icon */}
         <AnimatePresence>
            {status === "error" && (
               <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className='absolute inset-0 flex items-center justify-center bg-[var(--bg-elevated)]'>
                  <Music2
                     className='text-[var(--text-muted)]/40'
                     style={{
                        width: `${iconScale * 100}%`,
                        height: `${iconScale * 100}%`
                     }}
                  />
               </motion.div>
            )}
         </AnimatePresence>
      </div>
   );
}

// ── Shimmer animation ─────────────────────────────────────────
// Add to your global CSS / tailwind config:
//
// @keyframes shimmer {
//   0%   { transform: translateX(-100%); }
//   100% { transform: translateX(100%);  }
// }
// .animate-shimmer { animation: shimmer 1.4s infinite; }
//
// Or add to tailwind.config.ts:
// theme: { extend: { animation: { shimmer: 'shimmer 1.4s infinite' },
//   keyframes: { shimmer: { '0%': { transform: 'translateX(-100%)' },
//                            '100%': { transform: 'translateX(100%)' } } } } }
