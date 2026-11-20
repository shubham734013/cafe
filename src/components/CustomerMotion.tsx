import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface CustomerMotionProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function CustomerPage({ children, className }: CustomerMotionProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function CustomerCard({
  children,
  className,
  delay = 0,
}: CustomerMotionProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: reduceMotion ? 0 : 0.38,
        delay: reduceMotion ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
    >
      {children}
    </motion.div>
  );
}

export function CustomerText({
  children,
  className,
  delay = 0,
}: CustomerMotionProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.span
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 8, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{
        duration: reduceMotion ? 0 : 0.48,
        delay: reduceMotion ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.span>
  );
}
