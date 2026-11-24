import type { ReactNode } from 'react';

export interface CommunityTestimonial {
  id: string;
  quote: string;
  authorName: string;
  authorTitle: string;
  avatarUrl?: string;
  initials?: string;
  rating: number;
  dishName?: string;
}

export interface CommunityTestimonialsData {
  title: string;
  subtitle: string;
  rows: {
    id: string;
    speed: string;
    direction: 'left' | 'right';
    testimonials: CommunityTestimonial[];
  }[];
}

interface TestimonialsSectionProps {
  data: CommunityTestimonialsData;
  onSelectDish?: (dishName?: string) => void;
}

interface HorizontalScrollerProps {
  children: ReactNode;
  speed: string;
  direction: 'left' | 'right';
  itemCount: number;
}

function getInitials(name: string, initials?: string) {
  if (initials?.trim()) return initials.trim().slice(0, 2).toUpperCase();
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

export function TestimonialCard({
  testimonial,
  onSelectDish,
}: {
  testimonial: CommunityTestimonial;
  onSelectDish?: (dishName?: string) => void;
}) {
  const rating = Math.max(0, Math.min(5, Math.round(testimonial.rating)));

  return (
    <figure className="flex w-80 shrink-0 flex-col items-start gap-4 rounded-3xl border border-outline-variant bg-surface-container-low p-6 shadow-lg sm:w-96">
      <blockquote className="text-sm leading-relaxed text-on-surface sm:text-base">
        “{testimonial.quote}”
      </blockquote>
      <figcaption className="mt-auto flex w-full items-center gap-3">
        <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary">
          {getInitials(testimonial.authorName, testimonial.initials)}
          {testimonial.avatarUrl && (
            <img
              src={testimonial.avatarUrl}
              alt={testimonial.authorName}
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <cite className="truncate text-sm font-bold not-italic text-on-surface">
            {testimonial.authorName}
          </cite>
          <span className="truncate text-xs text-on-surface-variant">
            {testimonial.authorTitle}
          </span>
        </span>
        <span
          className="shrink-0 text-amber-500"
          role="img"
          aria-label={`${rating} out of 5 stars`}
        >
          {'★'.repeat(rating)}
          <span className="text-outline-variant">{'★'.repeat(5 - rating)}</span>
        </span>
      </figcaption>
      {testimonial.dishName && (
        <button
          type="button"
          onClick={() => onSelectDish?.(testimonial.dishName)}
          disabled={!onSelectDish}
          className="inline-flex items-center gap-1 text-left text-xs font-semibold text-primary enabled:cursor-pointer enabled:hover:underline disabled:cursor-default"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            restaurant
          </span>
          {testimonial.dishName}
        </button>
      )}
    </figure>
  );
}

export function HorizontalScroller({
  children,
  speed,
  direction,
  itemCount,
}: HorizontalScrollerProps) {
  const animationClass =
    direction === 'right' ? 'animate-scroll-horizontal-reverse' : 'animate-scroll-horizontal';
  const shouldLoop = itemCount > 1;

  return (
    <div className="community-testimonial-scroller mask-fade relative w-full overflow-hidden">
      <div
        className={`community-testimonial-track flex w-max ${
          shouldLoop ? animationClass : 'justify-center'
        }`}
        style={shouldLoop ? { animationDuration: speed } : undefined}
      >
        <div className="flex items-stretch justify-center gap-4 px-4">{children}</div>
        {shouldLoop && (
          <div
            className="community-testimonial-duplicate flex items-stretch justify-center gap-4 px-4"
            aria-hidden="true"
            inert
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TestimonialsSection({
  data,
  onSelectDish,
}: TestimonialsSectionProps) {
  return (
    <section className="relative flex w-full flex-col items-center gap-8 overflow-hidden py-6 sm:gap-10">
      <div className="community-testimonial-title-block z-10 flex max-w-2xl flex-col items-center gap-2 px-4 text-center">
        <h3 className="community-testimonial-title text-2xl font-extrabold leading-tight text-on-surface sm:text-3xl">
          {data.title}
        </h3>
        <p className="community-testimonial-subtitle text-sm text-on-surface-variant sm:text-base">
          {data.subtitle}
        </p>
      </div>

      <div className="z-10 flex w-full flex-col gap-5">
        {data.rows.map((row) => (
          <HorizontalScroller
            key={row.id}
            speed={row.speed}
            direction={row.direction}
            itemCount={row.testimonials.length}
          >
            {row.testimonials.map((testimonial) => (
              <TestimonialCard
                key={testimonial.id}
                testimonial={testimonial}
                onSelectDish={onSelectDish}
              />
            ))}
          </HorizontalScroller>
        ))}
      </div>

      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 85% 67% at 50% 100%, rgba(255,100,34,0.12) 0%, transparent 60%)',
        }}
      />
    </section>
  );
}
