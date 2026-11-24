import React from "react";
import { AnimatedMarqueeHero } from "@/components/ui/hero-3";

// High-quality cafe atmosphere, coffee craft & gourmet food photos from Unsplash
export const CAFE_SHOWCASE_PHOTOS = [
  "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80", // Cozy modern cafe interior
  "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80", // Artisan coffee bar & barista
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80", // Warm cafe seating & ambiance
  "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=800&q=80", // Elegant cafe corner with plants
  "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80", // Steaming cappuccino latte art
  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80", // Gourmet cheesy burger
  "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80", // Fresh wood-fired pizza
  "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=800&q=80", // Barista pour-over craft
  "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=800&q=80", // Roasted premium coffee beans
  "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80", // Lively restaurant dining vibe
];

const AnimatedHeroDemo = () => {
  return (
    <AnimatedMarqueeHero
      tagline="Welcome to The Sawariya Cafe (TSC)"
      title={
        <>
          Good Food • Good Mood
          <br />
          Great Moments in Jaipur
        </>
      }
      description="Experience 100% pure vegetarian culinary delights, signature cold coffees, cheesy pizzas, and cozy cafe vibes with friends and family."
      ctaText="Explore Menu & Order"
      images={CAFE_SHOWCASE_PHOTOS}
    />
  );
};

export default AnimatedHeroDemo;
