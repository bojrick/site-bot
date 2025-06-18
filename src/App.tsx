import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Sites from "./pages/Sites";
import Activities from "./pages/Activities";
import MaterialRequests from "./pages/MaterialRequests";
import Bookings from "./pages/Bookings";
import MessageLogs from "./pages/MessageLogs";
import Sessions from "./pages/Sessions";
import EmployeeOTPs from "./pages/EmployeeOTPs";
import CustomerInquiries from "./pages/CustomerInquiries";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SidebarProvider>
          <div className="min-h-screen flex w-full">
            <AppSidebar />
            <SidebarInset>
              <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
              </header>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/users" element={<Users />} />
                <Route path="/sites" element={<Sites />} />
                <Route path="/activities" element={<Activities />} />
                <Route path="/material-requests" element={<MaterialRequests />} />
                <Route path="/bookings" element={<Bookings />} />
                <Route path="/message-logs" element={<MessageLogs />} />
                <Route path="/sessions" element={<Sessions />} />
                <Route path="/employee-otps" element={<EmployeeOTPs />} />
                <Route path="/customer-inquiries" element={<CustomerInquiries />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
