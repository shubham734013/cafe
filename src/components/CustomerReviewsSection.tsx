import React, { useMemo, useState } from 'react';
import type { CafeOrder, CustomerReview, MenuItem } from '../types/cafe';
import type { CustomerFeedbackInput } from '../shared/schemas';
import TestimonialsSection, {
  type CommunityTestimonialsData,
} from '@/components/ui/community-testimonial';
import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';
import { ShinyText } from '@/components/ui/shiny-text';

const GOOGLE_REVIEW_URL =
  'https://search.google.com/local/writereview?placeid=ChIJKdSBIaazbTkRbOW0-Yl-R00&source=g.page.m.ia._&utm_source=gbp&laa=nmx-review-solicitation-ia2';

interface CustomerReviewsSectionProps {
  orders?: CafeOrder[];
  customerReviews?: CustomerReview[];
  menuItems: MenuItem[];
  onSelectDish?: (item: MenuItem) => void;
  onSubmitFeedback: (feedback: CustomerFeedbackInput) => Promise<void>;
  onNotify: (msg: string) => void;
}

export const CustomerReviewsSection: React.FC<CustomerReviewsSectionProps> = ({
  orders = [],
  customerReviews = [],
  menuItems,
  onSelectDish,
  onSubmitFeedback,
  onNotify,
}) => {
  const [writeModalOpen, setWriteModalOpen] = useState(false);

  const [newRating, setNewRating] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Derive reviews only from customer-submitted order feedback.
  const allReviews = useMemo(() => {
    const liveOrderReviews: CustomerReview[] = [];
    orders.forEach((order) => {
      if (order.rating && (order.feedbackComment || order.feedbackTags?.length)) {
        const dishItem = order.items?.[0];
        const menuItem = dishItem ? menuItems.find((m) => m.id === dishItem.menuItemId) : undefined;
        const tableLabel = order.tableNumber?.replace(/^T/, '');
        liveOrderReviews.push({
          id: `order-rev-${order.id}`,
          customerName: 'Cafe Customer',
          rating: order.rating,
          comment: order.feedbackComment || order.feedbackTags?.join(' · ') || '',
          dishName: dishItem?.name || menuItem?.name,
          diningMode:
            order.serviceMode === 'dine-in'
              ? tableLabel
                ? `Verified Dine-In • Table ${tableLabel}`
                : 'Verified Dine-In'
              : order.serviceMode === 'delivery'
                ? 'Verified Delivery'
                : 'Verified Takeaway',
          dateLabel: order.createdAtLabel || 'Recent',
        });
      }
    });

    return [...customerReviews, ...liveOrderReviews];
  }, [customerReviews, menuItems, orders]);
  const averageRating =
    allReviews.reduce((total, review) => total + review.rating, 0) / (allReviews.length || 1);
  const testimonialsData: CommunityTestimonialsData = {
    title: 'What our customers say',
    subtitle: 'Real feedback shared by guests at The Sawariya Cafe.',
    rows: [
      {
        id: 'customer-reviews',
        speed: '45s',
        direction: 'left',
        testimonials: allReviews.map((review) => ({
          id: review.id,
          quote: review.comment,
          authorName: review.customerName,
          authorTitle: [review.dateLabel, review.diningMode?.replace(/^Verified /, '')]
            .filter(Boolean)
            .join(' · '),
          avatarUrl: review.avatarUrl,
          initials: review.initials,
          rating: review.rating,
          dishName: review.dishName,
        })),
      },
    ],
  };

  const handleDishClick = (dishName?: string) => {
    if (!dishName || !onSelectDish) return;
    const match = menuItems.find(
      (m) =>
        m.name.toLowerCase().includes(dishName.toLowerCase()) ||
        dishName.toLowerCase().includes(m.name.toLowerCase())
    );
    if (match) {
      onSelectDish(match);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newRating === null) {
      setSubmitError('Please select a rating before sending your feedback.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    try {
      await onSubmitFeedback({
        customerName: newName.trim(),
        rating: newRating,
        tags: [],
        comment: newComment.trim(),
      });
      setWriteModalOpen(false);
      setNewName('');
      setNewComment('');
      setNewRating(null);
      onNotify('Thank you. Your feedback has been sent to our team.');
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Could not send feedback. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BlurFade delay={0.2} inView className="pt-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-extrabold text-on-surface tracking-tight">
            Customer Reviews
          </h2>
          {allReviews.length > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 text-xs font-bold">
              <span>★ {averageRating.toFixed(1)}</span>
              <span className="text-[10px] text-amber-400/80">
                (<NumberTicker value={allReviews.length} />)
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <a
            href={GOOGLE_REVIEW_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Write a Google review (opens in a new tab)"
            className="text-xs font-bold text-[#FF6422] hover:text-[#E55518] transition-colors flex items-center gap-1 group"
          >
            <span className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform">
              rate_review
            </span>
            <ShinyText text="Google Review" speed={2.5} className="font-bold text-[#FF6422]" />
          </a>
          <button
            type="button"
            onClick={() => setWriteModalOpen(true)}
            className="text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            Give Feedback
          </button>
        </div>
      </div>

      {allReviews.length === 0 ? (
        <div
          role="status"
          className="mx-auto mt-5 w-full max-w-sm rounded-3xl border border-outline-variant bg-surface-container-low p-6 text-center shadow-sm"
        >
          <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <span className="material-symbols-outlined" aria-hidden="true">
              rate_review
            </span>
          </span>
          <p className="mt-4 font-semibold text-on-surface">No reviews yet</p>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            Be the first to share your experience with us.
          </p>
        </div>
      ) : (
        <TestimonialsSection
          data={testimonialsData}
          onSelectDish={(dishName) => handleDishClick(dishName)}
        />
      )}

      {/* Customer Feedback Modal */}
      {writeModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
          onClick={() => setWriteModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-surface-container p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-on-surface">Share feedback</h3>
              <button
                type="button"
                onClick={() => setWriteModalOpen(false)}
                aria-label="Close feedback form"
                className="text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <p className="text-xs text-on-surface-variant">
              Rate a served order in Order Tracking to earn 25 Beans for a future order.
            </p>

            <form onSubmit={handleSubmitReview} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-on-surface-variant">Rating</label>
                <div className="flex items-center gap-1" role="group" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((star) => {
                    return (
                      <button
                        key={star}
                        type="button"
                        aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
                        aria-pressed={star === newRating}
                        onClick={() => setNewRating(star)}
                        className="text-2xl"
                      >
                        <span className={star <= newRating ? 'text-amber-400' : 'text-outline'}>
                          ★
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="feedback-name">
                  Name
                </label>
                <input
                  id="feedback-name"
                  type="text"
                  required
                  maxLength={80}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoComplete="name"
                  className="w-full rounded-lg border border-outline-variant/20 bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-[#FF6422]/50"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="feedback-comment">
                  Feedback
                </label>
                <textarea
                  id="feedback-comment"
                  required
                  minLength={3}
                  maxLength={1000}
                  rows={4}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Tell us what went well or what we could improve..."
                  className="w-full rounded-lg border border-outline-variant/20 bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-[#FF6422]/50"
                />
              </div>

              {submitError && (
                <p role="alert" className="text-xs font-medium text-error">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-[#FF6422] py-2.5 text-sm font-semibold text-white hover:bg-[#E55518] disabled:cursor-wait disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? 'Sending...' : 'Send feedback'}
              </button>
            </form>
          </div>
        </div>
      )}
    </BlurFade>
  );
};
