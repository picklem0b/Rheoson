import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
   const navigate = useNavigate();

   return (
      <div className='flex flex-col items-center justify-center h-full px-8 text-center gap-6'>
         <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 18 }}
            className='w-28 h-28 rounded-[2rem] bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center'>
            <span className='text-5xl font-black text-[var(--accent)]'>?</span>
         </motion.div>

         <div>
            <h1 className='text-3xl font-black text-[var(--text-primary)]'>
               404
            </h1>
            <p className='text-sm text-[var(--text-muted)] mt-2 leading-relaxed max-w-xs'>
               This page doesn&apos;t exist or has been moved.
            </p>
         </div>

         <div className='flex gap-3'>
            <motion.button
               whileTap={{ scale: 0.95 }}
               onClick={() => navigate(-1)}
               className='flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[var(--bg-elevated)]
            text-sm font-semibold text-[var(--text-primary)] border border-[var(--border)]
            active:bg-[var(--bg-surface)] transition-colors'>
               <ArrowLeft className='w-4 h-4' />
               Go back
            </motion.button>

            <motion.button
               whileTap={{ scale: 0.95 }}
               onClick={() => navigate("/")}
               className='flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[var(--accent)]
            text-sm font-bold text-white shadow-lg'>
               <Home className='w-4 h-4' />
               Home
            </motion.button>
         </div>

         <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate("/search")}
            className='flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]
          hover:text-[var(--accent)] transition-colors mt-2'>
            <Search className='w-3 h-3' />
            Search for music
         </motion.button>
      </div>
   );
}
