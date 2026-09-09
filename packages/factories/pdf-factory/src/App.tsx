import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Home from "./pages/Home";
import PDFFactory from "./pages/PDFFactory";
import NotFound from "./pages/NotFound";

// Lazy-loaded so the pdf.js/pdf-lib/jszip conversion code for these tools
// isn't pulled into the initial landing-page bundle.
const PDFToImage = lazy(() => import("./pages/PDFToImage"));
const ImageToPDF = lazy(() => import("./pages/ImageToPDF"));
const CompressPDF = lazy(() => import("./pages/CompressPDF"));
const ProtectPDF = lazy(() => import("./pages/ProtectPDF"));
const OcrPDF = lazy(() => import("./pages/OcrPDF"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex h-screen items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/factory" element={<PDFFactory />} />
            <Route path="/factory/pdf-to-image" element={<PDFToImage />} />
            <Route path="/factory/image-to-pdf" element={<ImageToPDF />} />
            <Route path="/factory/compress" element={<CompressPDF />} />
            <Route path="/factory/protect" element={<ProtectPDF />} />
            <Route path="/factory/ocr" element={<OcrPDF />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
