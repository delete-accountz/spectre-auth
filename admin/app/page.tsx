import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { BentoSection } from "@/components/landing/bento-section";
import { TestimonialsSection } from "@/components/landing/testimonials-section";
import { GlobeSection } from "@/components/landing/globe-section";
import { CtaSection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background">
      <HeroSection />
      <FeaturesSection />
      <BentoSection />
      <TestimonialsSection />
      <GlobeSection />
      <CtaSection />
      <Footer />
    </main>
  );
}
