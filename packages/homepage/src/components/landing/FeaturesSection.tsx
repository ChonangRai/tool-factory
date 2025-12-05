import { Shield, Users, Zap, Code } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    icon: Users,
    title: "Multi-tenancy Support",
    description: "Organize teams with isolated workspaces and granular permissions.",
  },
  {
    icon: Zap,
    title: "Real-time Collaboration",
    description: "Work together seamlessly with live updates and notifications.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Bank-grade encryption and compliance with industry standards.",
  },
  {
    icon: Code,
    title: "API Access",
    description: "Full REST API for custom integrations and automation.",
  },
];

const FeaturesSection = () => {
  return (
    <section className="border-t border-border bg-muted/30 py-16 md:py-24">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">
            Built for Scale
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Every Tool Factory application is designed with enterprise needs in mind.
          </p>
        </div>

        {/* Features grid */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
              className="text-center"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
