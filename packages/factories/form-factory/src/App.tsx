import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Home from "./pages/Home";
import SubmitReceipt from "./pages/SubmitReceipt";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import AllSubmissions from "./pages/AllSubmissions";
import ArchivedSubmissions from "./pages/ArchivedSubmissions";
import UserManagement from "./pages/UserManagement";
import FormBuilder from "./pages/FormBuilder";
import Settings from "./pages/Settings";
import DashboardLayout from "./layouts/DashboardLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/submit/:formId" element={<SubmitReceipt />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/auth/reset-password" element={<ResetPassword />} />
          
          {/* Protected Dashboard Routes with Layout */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requireAdmin={true}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="forms" element={<Admin />} />
            <Route path="forms/new" element={<FormBuilder />} />
            <Route path="forms/:formId/edit" element={<FormBuilder />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="submissions" element={<AllSubmissions />} />
            <Route path="archived" element={<ArchivedSubmissions />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Redirect /admin to /dashboard for backwards compatibility */}
          <Route path="/admin/*" element={<NotFound />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
