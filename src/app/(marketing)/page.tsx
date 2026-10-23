import {
  Audiences,
  Coverage,
  Fairness,
  FinalCta,
  Hero,
  HowItWorks,
  Kinds,
  TenderPack,
} from "@/components/landing/sections";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Kinds />
      <Audiences />
      <HowItWorks />
      <Fairness />
      <Coverage />
      <TenderPack />
      <FinalCta />
    </>
  );
}
