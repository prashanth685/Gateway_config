import { UserRoundPlus } from "lucide-react";

export default function User({ onClick, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`p-2 text-[#6C757D] hover:text-[#4361EE] hover:bg-[#EEF0FE] rounded-lg transition-colors cursor-pointer ${className}`}
      title="Add User"
    >
      <UserRoundPlus className="w-5 h-5" />
    </button>
  );
}
