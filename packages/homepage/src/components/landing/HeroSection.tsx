import { Factory } from "lucide-react";
import { motion } from "framer-motion";

const HeroSection = () => {
  return (
    <section className="relative overflow-hidden py-20 md:py-32">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-subtle" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_50%)]" />
      
      <div className="container relative mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center gap-6"
        >
          {/* Logo */}
          <div className="flex items-center justify-center gap-3">
            <div className="rounded-xl bg-primary p-3 shadow-elevated">
              <Factory className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-6xl lg:text-7xl">
            Tool{" "}
            <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Factory
            </span>
          </h1>

          {/* Subheading */}
          <p className="max-w-2xl text-lg text-muted-foreground md:text-xl">
            Professional productivity tools for modern teams. Streamline your workflows with our suite of enterprise-grade applications.
          </p>

          {/* CTA hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span className="h-px w-8 bg-border" />
            <span>Explore our tools below</span>
            <span className="h-px w-8 bg-border" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
