import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, ClipboardList, GitBranch, Sparkles, ArrowRight, CheckCircle, Users, Shield, Rocket } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative px-6 lg:px-8 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <div className="flex items-center justify-center space-x-3 mb-8">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
              <Zap className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              BacklogGenXpert
            </h1>
          </div>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            AI-powered backlog management platform that generates, rewrites, and syncs work items with Jira and Azure DevOps using project context.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button size="lg" onClick={handleLogin} className="text-lg px-8 py-4" data-testid="button-login">
              <Sparkles className="w-5 h-5 mr-2" />
              Get Started
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-4" data-testid="button-learn-more">
              Learn More
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant="secondary" className="text-sm">Google SSO</Badge>
            <Badge variant="secondary" className="text-sm">Azure AD</Badge>
            <Badge variant="secondary" className="text-sm">Jira Integration</Badge>
            <Badge variant="secondary" className="text-sm">Azure DevOps</Badge>
            <Badge variant="secondary" className="text-sm">AI-Powered</Badge>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-6 lg:px-8 py-24 bg-muted/50">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              Powerful Features for Modern Teams
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to streamline your backlog management and accelerate delivery with AI assistance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>AI-Powered Generation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Generate comprehensive Epics, Features, User Stories, and Tasks using advanced AI with project-specific context.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <GitBranch className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Seamless Integration</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Connect with Jira, Azure DevOps, Confluence, and SharePoint to sync updates while preserving hierarchies.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <ClipboardList className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Smart Templates</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Customizable prompt templates with variable substitution for consistent, high-quality work item generation.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Multi-Tenant Workspaces</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Role-based access control with workspace and project management for teams of any size.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Enterprise Security</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Encrypted secret storage, comprehensive audit logging, and enterprise-grade authentication.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Rocket className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Context-Aware AI</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Upload project documents to provide AI with relevant context for more accurate and useful generations.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="px-6 lg:px-8 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              How It Works
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Simple workflow to transform your backlog management with AI assistance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary-foreground">1</span>
              </div>
              <h3 className="text-xl font-semibold mb-4">Connect & Configure</h3>
              <p className="text-muted-foreground">
                Set up your workspace, connect to Jira or Azure DevOps, and upload project context files.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary-foreground">2</span>
              </div>
              <h3 className="text-xl font-semibold mb-4">Select & Generate</h3>
              <p className="text-muted-foreground">
                Browse work items, select multiple items, choose a template, and let AI enhance them with context.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary-foreground">3</span>
              </div>
              <h3 className="text-xl font-semibold mb-4">Review & Apply</h3>
              <p className="text-muted-foreground">
                Preview AI-generated changes, review diffs, and selectively apply updates back to your tracker.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="px-6 lg:px-8 py-24 bg-muted/50">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
                Transform Your Backlog Management
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Reduce time spent on backlog grooming, improve work item quality, and ensure consistency across your team's delivery process.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-6 h-6 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Save 70% Time on Backlog Grooming</h4>
                    <p className="text-muted-foreground">AI-generated acceptance criteria, tasks, and test cases reduce manual effort.</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-6 h-6 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Improve Work Item Quality</h4>
                    <p className="text-muted-foreground">Consistent formatting, comprehensive details, and project-specific context.</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-6 h-6 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Maintain Tool Synchronization</h4>
                    <p className="text-muted-foreground">Bi-directional sync with existing workflows and hierarchy preservation.</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <Card className="p-8">
                <div className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium">AI Generation in Progress</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="h-2 bg-muted rounded-full">
                      <div className="h-2 bg-primary rounded-full w-3/4 transition-all duration-300"></div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Processing 3 work items with project context...
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm">Enhanced acceptance criteria</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm">Generated sub-tasks</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-primary rounded-full animate-spin"></div>
                      <span className="text-sm">Creating test cases...</span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 lg:px-8 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
            Ready to Transform Your Backlog?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join teams already using BacklogGenXpert to accelerate their delivery and improve work item quality.
          </p>
          <Button size="lg" onClick={handleLogin} className="text-lg px-8 py-4" data-testid="button-cta-login">
            <Sparkles className="w-5 h-5 mr-2" />
            Start Free Trial
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 lg:px-8 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold">BacklogGenXpert</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 Thrivara Consulting. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
