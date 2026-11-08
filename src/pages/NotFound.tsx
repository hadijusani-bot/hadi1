import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound({ inApp }: { inApp?: boolean }) {
  return (
    <div className={inApp ? "grid place-items-center py-24" : "grid min-h-screen place-items-center bg-grid px-4"}>
      <div className="text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary"><Compass className="h-6 w-6" /></div>
        <p className="font-mono text-sm text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold">This page wandered off the pipeline</h1>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
        <Link to={inApp ? "/app" : "/"}><Button className="mt-6">Back to {inApp ? "dashboard" : "home"}</Button></Link>
      </div>
    </div>
  );
}
