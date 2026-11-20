import React, { useMemo, useState } from 'react';
import type { CafeOrder, CustomerReview, MenuItem } from '../types/cafe';
import type { CustomerFeedbackInput } from '../shared/schemas';

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

  const [newRating, setNewRating] = useState<number>(1);
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
      setNewRating(1);
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
    <div className="pt-3 pb-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-on-surface">Reviews</h2>
        </div>

        <button
          type="button"
          onClick={() => setWriteModalOpen(true)}
          className="text-xs font-semibold text-[#FF6422] hover:text-[#E55518] transition-colors"
        >
          Give feedback
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
        {allReviews.length === 0 ? (
          <div className="w-full py-6 text-center text-sm text-on-surface-variant">
            No reviews yet.
          </div>
        ) : (
          allReviews.map((review) => (
            <div
              key={review.id}
              className="w-[280px] sm:w-[320px] shrink-0 rounded-xl border border-outline-variant/10 bg-surface-container/40 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-medium text-on-surface">
                  {review.customerName}
                </h3>
                <span className="flex shrink-0 items-center gap-1 text-xs text-amber-400">
                  <span aria-hidden="true">★</span>
                  {review.rating}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-on-surface-variant">
                {review.dateLabel}
                {review.diningMode ? ` · ${review.diningMode.replace('Verified ', '')}` : ''}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-on-surface line-clamp-4">
                {review.comment}
              </p>
              {review.dishName && (
                <button
                  type="button"
                  onClick={() => handleDishClick(review.dishName)}
                  className="mt-3 text-left text-xs text-on-surface-variant hover:text-[#FF6422]"
                >
                  {review.dishName}
                </button>
              )}
            </div>
          ))
        )}
      </div>

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
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => {
                    return (
                      <button
                        key={star}
                        type="button"
                        aria-label={`Rate ${star} stars`}
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
                className="w-full rounded-lg bg-[#FF6422] py-2.5 text-sm font-semibold text-white hover:bg-[#E55518] disabled:cursor-wait disabled:opacity-60"
              >
                {isSubmitting ? 'Sending...' : 'Send feedback'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
