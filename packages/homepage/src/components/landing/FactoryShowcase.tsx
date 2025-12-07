import { FileText, Image, QrCode, ClipboardList } from "lucide-react";
import FactoryCard, { Factory } from "./FactoryCard";

const factories: Factory[] = [
  {
    id: "form-factory",
    name: "Form Factory",
    description: "Create, manage, and process form submissions with OCR support. Perfect for receipt collection, expense management, contact forms, and data collection. Enterprise-ready with real-time notifications and secure storage.",
    icon: ClipboardList,
    status: "available",
    url: "http://forms.toolfactory.uk",
  },
  {
    id: "pdf-factory",
    name: "PDF Factory",
    description: "Merge, split, compress, and convert PDF documents with powerful batch processing capabilities.",
    icon: FileText,
    status: "coming-soon",
  },
  {
    id: "image-factory",
    name: "Image Factory",
    description: "Resize, compress, convert, and edit images in bulk. Apply filters and transformations with ease.",
    icon: Image,
    status: "coming-soon",
  },
  {
    id: "qr-factory",
    name: "QR Factory",
    description: "Generate and scan QR codes with custom branding options and built-in analytics tracking.",
    icon: QrCode,
    status: "coming-soon",
  },
];

const FactoryShowcase = () => {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">
            Our Factories
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            A growing suite of productivity tools designed to help teams work smarter, not harder.
          </p>
        </div>

        {/* Factory grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
          {factories.map((factory, index) => (
            <FactoryCard key={factory.id} factory={factory} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default FactoryShowcase;
