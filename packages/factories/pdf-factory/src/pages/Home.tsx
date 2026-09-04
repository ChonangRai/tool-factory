import { Link } from 'react-router-dom';
import { ArrowRight, CloudOff, ShieldCheck, Wrench, Zap } from 'lucide-react';
import Header from '@/components/factory/Header';
import { FeaturedToolCard, ToolCard } from '@/components/factory/ToolCard';
import { CONVERTER_TOOLS, UPCOMING_TOOLS, WORKSPACE_TOOL } from '@/lib/tools';

const trustPoints = [
  {
    icon: ShieldCheck,
    title: 'Files stay on your device',
    description: 'PDFs are opened and edited in this browser tab. They are never sent anywhere.',
  },
  {
    icon: CloudOff,
    title: 'No uploads, no account',
    description: 'There is no server to upload to and nothing to sign up for.',
  },
  {
    icon: Zap,
    title: 'Instant processing',
    description: 'Work happens locally, so results are ready as soon as your device finishes.',
  },
];

const Home = () => {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border bg-gradient-to-b from-primary/[0.04] to-transparent">
          <div className="page-shell py-14 sm:py-20">
            {/* Centred so the copy doesn't leave a dead right half on wide screens */}
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                <Wrench className="h-4 w-4" aria-hidden="true" />
                Part of ToolFactory
              </span>

              <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                PDF tools that never leave your browser
              </h1>

              <p className="mt-4 text-lg text-muted-foreground">
                Merge, split, reorder, annotate and convert PDFs. Every file is processed locally on your
                device — nothing is uploaded to a server.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
                <Link
                  to={WORKSPACE_TOOL.path!}
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:shadow-lg"
                >
                  Open PDF Workspace
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>

                <a
                  href="#tools"
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-input bg-background px-6 py-3 text-base font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  Browse all tools
                </a>
              </div>

              <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Your documents are processed entirely in this browser tab.
              </p>
            </div>
          </div>
        </section>

        {/* Tools */}
        <section id="tools" className="page-shell scroll-mt-20 py-14 sm:py-16">
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Tools</h2>
            <p className="mt-1 text-muted-foreground">
              Start in the workspace for page-level work, or jump straight to a converter.
            </p>
          </div>

          <FeaturedToolCard tool={WORKSPACE_TOOL} />

          <h3 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Convert
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {CONVERTER_TOOLS.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>

          <h3 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Coming soon
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {UPCOMING_TOOLS.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>

        {/* Privacy */}
        <section className="border-t border-border bg-secondary/30 py-14 sm:py-16">
          <div className="page-shell">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Private by design</h2>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              PDF Factory runs entirely in your browser, so your documents stay yours.
            </p>

            <ul className="mt-8 grid gap-6 sm:grid-cols-3">
              {trustPoints.map((point) => (
                <li key={point.title}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <point.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-3 font-semibold text-foreground">{point.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{point.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="page-shell text-center text-sm text-muted-foreground">
          <p>Part of the ToolFactory ecosystem</p>
        </div>
      </footer>
    </div>
  );
};

export default Home;
