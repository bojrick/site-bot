import { Calendar, Users, Building, Activity, Package, BookOpen, MessageSquare, Timer, Key, BarChart3, HelpCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

const menuItems = [
  {
    title: "Overview",
    url: "/",
    icon: BarChart3,
  },
  {
    title: "Users Management",
    url: "/users",
    icon: Users,
  },
  {
    title: "Sites Management", 
    url: "/sites",
    icon: Building,
  },
  {
    title: "Activities",
    url: "/activities",
    icon: Activity,
  },
  {
    title: "Material Requests",
    url: "/material-requests",
    icon: Package,
  },
  {
    title: "Bookings",
    url: "/bookings",
    icon: Calendar,
  },
  {
    title: "Message Logs",
    url: "/message-logs",
    icon: MessageSquare,
  },
  {
    title: "Sessions",
    url: "/sessions",
    icon: Timer,
  },
  {
    title: "Employee OTPs",
    url: "/employee-otps",
    icon: Key,
  },
  {
    title: "Customer Inquiries",
    url: "/customer-inquiries",
    icon: HelpCircle,
  },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <h2 className="text-lg font-semibold">ERP Dashboard</h2>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild
                    isActive={location.pathname === item.url}
                  >
                    <button
                      onClick={() => navigate(item.url)}
                      className="w-full flex items-center gap-2"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <p className="text-sm text-muted-foreground">ERP System v1.0</p>
      </SidebarFooter>
    </Sidebar>
  );
}