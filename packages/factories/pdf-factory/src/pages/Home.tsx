import { Link } from 'react-router-dom';
import { 
  FileText, 
  Shuffle, 
  Image, 
  Minimize2, 
  Merge, 
  Scissors, 
  Lock, 
  FileOutput,
  ArrowRight,
  Wrench
} from 'lucide-react';
import Header from '@/components/factory/Header';

const features = [
  {
    icon: Shuffle,
    title: 'Reorder Pages',
    description: 'Drag and drop (or touch) to rearrange PDF pages in any order you need.',
    available: true,
    path: '/factory',
  },
  {
    icon: Merge,
    title: 'Merge PDFs',
    description: 'Combine multiple PDF files into a single document.',
    available: true,
    path: '/factory',
  },
  {
    icon: Scissors,
    title: 'Split PDF',
    description: 'Extract specific pages or split into multiple files.',
    available: true,
    path: '/factory',
  },
  {
    icon: FileText,
    title: 'Edit PDF',
    description: 'Rotate, delete, and annotate pages within your PDF.',
    available: true,
    path: '/factory',
  },
  {
    icon: Image,
    title: 'PDF to Image',
    description: 'Export PDF pages as PNG or JPEG images.',
    available: true,
    path: '/factory/pdf-to-image',
  },
  {
    icon: FileOutput,
    title: 'Image to PDF',
    description: 'Combine JPEG and PNG images into a single PDF document.',
    available: true,
    path: '/factory/image-to-pdf',
  },
  {
    icon: Minimize2,
    title: 'Compress PDF',
    description: 'Reduce file size while maintaining quality for easy sharing.',
    available: false,
  },
  {
    icon: Lock,
    title: 'Protect PDF',
    description: 'Add password protection to secure your documents.',
    available: false,
  },
];

const Home = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
          <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
            <div className="text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                <Wrench className="h-4 w-4" />
                Part of ToolFactory
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Your Complete
                <span className="block text-primary">PDF Factory</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
                Merge, split, reorder, and edit your PDF files with powerful tools.
                No uploads to external servers — everything runs right in your browser.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row hover:cursor-pointer">
                <Link
                  to="/factory"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:shadow-xl"
                >
                  Open PDF Factory
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-foreground">
                Everything you need for PDFs
              </h2>
              <p className="mt-4 text-muted-foreground">
                A complete toolkit for all your PDF operations
              </p>
            </div>

            <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => {
                const cardClassName = `group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all ${
                  feature.available ? 'hover:border-primary/30 hover:shadow-md' : 'opacity-60'
                }`;

                const cardContent = (
                  <>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <feature.icon className="h-6 w-6" />
                      </div>
                      {!feature.available && (
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          Coming soon
                        </span>
                      )}
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-foreground">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </>
                );

                if (feature.available && feature.path) {
                  return (
                    <Link key={feature.title} to={feature.path} className={cardClassName}>
                      {cardContent}
                    </Link>
                  );
                }

                return (
                  <div key={feature.title} className={cardClassName}>
                    {cardContent}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t border-border bg-secondary/30 py-20">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-foreground">
              Ready to get started?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Jump into the PDF Factory and start processing your documents right away.
            </p>
            <Link
              to="/factory"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:shadow-xl"
            >
              Launch PDF Factory
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          <p>Part of the ToolFactory ecosystem</p>
        </div>
      </footer>
    </div>
  );
};

export default Home;
