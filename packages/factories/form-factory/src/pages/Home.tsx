import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList, Shield, Zap, CheckCircle } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Hero Section */}
      <header className="border-b bg-card shadow-subtle">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-8 w-8 text-primary" />
              <h1 className="text-xl font-bold text-foreground">Form Factory</h1>
            </div>
            <Link to="/auth">
              <Button variant="outline">Manager Portal</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Content */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-primary">
              <ClipboardList className="h-10 w-10 text-primary-foreground" />
            </div>
            <h2 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Collect Anything, Manage Everything
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
              Powerful form management for receipts, surveys, contact forms, feedback, applications, and any data collection. Fast, secure, and simple.
            </p>
            <div className="flex justify-center gap-4">
              <Link to="/auth">
                <Button size="lg" className="shadow-elevated">
                  Manager Login
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="bg-card py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h3 className="mb-12 text-center text-3xl font-bold text-foreground">
              Why Choose Form Factory?
            </h3>
            <div className="grid gap-8 md:grid-cols-3">
              <Card className="shadow-subtle">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                    <Zap className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <CardTitle>Fast Submission</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Submit your forms in under 2 minutes with our streamlined interface. No account
                    required for submissions.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="shadow-subtle">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                    <Shield className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <CardTitle>Secure & Private</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Your data is encrypted and protected. We use industry-standard security measures
                    to keep your information safe.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="shadow-subtle">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                    <CheckCircle className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <CardTitle>Instant Confirmation</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Receive instant email confirmation when your submission is received and when it's
                    processed.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <Card className="bg-gradient-primary text-center shadow-elevated">
            <CardContent className="py-12">
              <h3 className="mb-4 text-3xl font-bold text-primary-foreground">
                Ready to Start Collecting?
              </h3>
              <p className="mb-8 text-primary-foreground/90">
                Receipts, surveys, leads, feedback, applications - collect and manage it all
              </p>
              <Link to="/auth">
                <Button size="lg" variant="secondary">
                  Access Manager Portal
                </Button>
              </Link>
            </CardContent>
          </Card>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card py-8">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()}  Form Factory by <a href="https://toolfactory.uk" target="_blank" rel="noopener noreferrer">ToolFactory</a>. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
