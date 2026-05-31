import { ConceptCards } from "@/components/landing/ConceptCards";
import { HeroSection } from "@/components/landing/HeroSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { TrustLogos } from "@/components/landing/TrustLogos";
import { WorkflowSection } from "@/components/landing/WorkflowSection";

export default function Home() {
  return (
    <>
      <LandingHeader />
      <main className="bg-white">
        <HeroSection />
        <ConceptCards />
        <WorkflowSection />
        <TrustLogos />
      </main>
      <LandingFooter />
    </>
  );
}
