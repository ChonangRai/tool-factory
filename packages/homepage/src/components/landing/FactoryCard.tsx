import { LucideIcon, ArrowRight, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export interface Factory {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  status: "available" | "coming-soon";
  url?: string;
}

interface FactoryCardProps {
  factory: Factory;
  index: number;
}

const FactoryCard = ({ factory, index }: FactoryCardProps) => {
  const isAvailable = factory.status === "available";
  const Icon = factory.icon;

  const handleLaunch = () => {
    if (isAvailable && factory.url) {
      window.open(factory.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <Card
        className={cn(
          "group relative h-full overflow-hidden transition-all duration-300",
          isAvailable
            ? "cursor-pointer hover:shadow-elevated hover:-translate-y-1"
            : "opacity-70"
        )}
        onClick={handleLaunch}
      >
        {/* Gradient overlay on hover */}
        {isAvailable && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        )}

        <CardHeader className="relative pb-2">
          <div className="flex items-start justify-between">
            {/* Icon */}
            <div
              className={cn(
                "rounded-lg p-2.5 transition-colors duration-300",
                isAvailable
                  ? "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Icon className="h-6 w-6" />
            </div>

            {/* Status Badge */}
            <Badge
              variant={isAvailable ? "default" : "secondary"}
              className={cn(
                "text-xs font-medium",
                isAvailable
                  ? "bg-success/10 text-success hover:bg-success/20"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {isAvailable ? (
                "Available Now"
              ) : (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Coming Soon
                </span>
              )}
            </Badge>
          </div>

          <CardTitle className="mt-4 text-xl font-semibold text-foreground">
            {factory.name}
          </CardTitle>
        </CardHeader>

        <CardContent className="relative">
          <CardDescription className="mb-4 text-sm leading-relaxed text-muted-foreground">
            {factory.description}
          </CardDescription>

          {isAvailable ? (
            <Button
              variant="ghost"
              className="group/btn -ml-2 gap-2 text-primary hover:bg-primary/10 hover:text-primary"
            >
              Launch App
              <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
            </Button>
          ) : (
            <div className="text-sm text-muted-foreground/60">
              Stay tuned for updates
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default FactoryCard;
