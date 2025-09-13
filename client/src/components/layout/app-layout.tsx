import { ReactNode } from "react";
import Sidebar from "./sidebar";
import Header from "./header";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden" data-testid="app-layout">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title="Dashboard" 
          description="Generate and manage backlog items with AI" 
        />
        {children}
      </div>
    </div>
  );
}
