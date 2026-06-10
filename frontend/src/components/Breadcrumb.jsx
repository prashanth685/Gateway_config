import { Link } from "react-router";
import { ChevronRight } from "lucide-react";

export default function Breadcrumb({ segments }) {
  return (
    <div className="flex items-center gap-2 text-sm text-[#6C757D] mb-4">
      {segments.map((segment, index) => (
        <span key={index} className="flex items-center gap-2">
          {index > 0 && <ChevronRight className="w-4 h-4 text-[#ADB5BD]" />}
          {segment.to ? (
            <Link
              to={segment.to}
              className="hover:text-[#4361EE] transition-colors"
            >
              {segment.label}
            </Link>
          ) : (
            <span className="text-[#212529] font-medium">{segment.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
