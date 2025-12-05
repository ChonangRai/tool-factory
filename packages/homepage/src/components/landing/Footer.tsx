import { Factory } from "lucide-react";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border py-8">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Factory className="h-5 w-5 text-primary" />
          <span className="text-sm">
            © {currentYear} Tool Factory. All rights reserved.
          </span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
