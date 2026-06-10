import { Link } from "react-router";
import { Activity, Ratio } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="h-16 bg-white border-b border-[#E9ECEF] flex items-center px-6 shrink-0">
      <Link to="/" className="flex items-center gap-2 text-[#4361EE] hover:opacity-80 transition-opacity">
        <Ratio  className="w-5 h-5" />
        <span className="text-lg font-bold tracking-tight font-semibold">IOT CONFIG</span>
      </Link>
    </nav>
  );
}
