import { Helmet } from "react-helmet-async";
import HeroSection from "@/components/landing/HeroSection";
import FactoryShowcase from "@/components/landing/FactoryShowcase";
import FeaturesSection from "@/components/landing/FeaturesSection";
import Footer from "@/components/landing/Footer";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>Tool Factory - Professional Productivity Tools for Modern Teams</title>
        <meta
          name="description"
          content="Tool Factory offers a suite of enterprise-grade productivity tools including Form Factory, PDF Factory, Image Factory, and QR Factory. Streamline your workflows today."
        />
        <meta
          name="keywords"
          content="productivity tools, form builder, PDF tools, image editing, QR code generator, enterprise software"
        />
        <meta property="og:title" content="Tool Factory - Professional Productivity Tools" />
        <meta property="og:description" content="Enterprise-grade productivity tools for modern teams" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Tool Factory" />
        <meta name="twitter:description" content="Professional productivity tools for modern teams" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <main>
          <HeroSection />
          <FactoryShowcase />
          <FeaturesSection />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
