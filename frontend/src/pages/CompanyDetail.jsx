import { useState } from "react";
import { useParams, Link } from "react-router";
import { Plus, ChevronRight, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";
import Navbar from "@/components/Navbar";
import Breadcrumb from "@/components/Breadcrumb";

export default function CompanyDetail() {
  const { companyId } = useParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [label, setLabel] = useState("");
  const [prefixError, setPrefixError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  const [deletePrefix, setDeletePrefix] = useState("");

  const utils = trpc.useUtils();
  const company = trpc.company.get.useQuery(
    { id: companyId },
    { enabled: !!companyId }
  );
  const gateways = trpc.gateway.listByCompany.useQuery(
    { companyId: companyId },
    { enabled: !!companyId }
  );
  const createGateway = trpc.gateway.create.useMutation({
    onSuccess: () => {
      utils.gateway.listByCompany.invalidate({ companyId: companyId });
      setModalOpen(false);
      setPrefix("");
      setLabel("");
      setPrefixError("");
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        setPrefixError("This prefix is already in use.");
      }
    },
  });

  const deleteGateway = trpc.gateway.delete.useMutation({
    onSuccess: () => {
      utils.gateway.listByCompany.invalidate({ companyId: companyId });
      setDeleteOpen(false);
      setDeleteId("");
      setDeletePrefix("");
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    setPrefixError("");
    const trimmedPrefix = prefix.trim();
    const trimmedLabel = label.trim();
    if (!trimmedPrefix || !trimmedLabel || !companyId) return;
    createGateway.mutate({
      companyId,
      prefix: trimmedPrefix,
      label: trimmedLabel,
    });
  };

  const gatewayCount = gateways.data?.length ?? 0;

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <Navbar />
      <main className="max-w-[1400px] mx-auto p-6">
        {company.data && (
          <Breadcrumb
            segments={[
              { label: "Companies", to: "/" },
              { label: company.data.name },
            ]}
          />
        )}

        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-semibold text-[#212529] tracking-tight">
              {company.data?.name ?? "Loading..."}
            </h1>
            <p className="text-sm text-[#6C757D] mt-1">
              {gatewayCount} gateway{gatewayCount !== 1 ? "s" : ""} configured
            </p>
          </div>
          <Button
            onClick={() => setModalOpen(true)}
            className="bg-[#4361EE] hover:bg-[#3A53D0] text-white h-10 px-4"
            disabled={!company.data}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Gateway
          </Button>
        </div>

        {gateways.isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[#4361EE]" />
          </div>
        )}

        {gateways.isError && (
          <div className="text-center py-20 text-[#DC3545]">
            Failed to load gateways.
          </div>
        )}

        {gateways.data && gateways.data.length === 0 && (
          <div className="bg-white border border-[#E9ECEF] rounded-xl p-12 text-center mt-6">
            <p className="text-[#6C757D] mb-2">No gateways configured yet</p>
            <p className="text-[#ADB5BD] text-sm mb-4">
              Add a gateway to start configuring your IoT devices
            </p>
            <Button
              onClick={() => setModalOpen(true)}
              variant="outline"
              className="border-[#4361EE] text-[#4361EE] hover:bg-[#EEF0FE]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Gateway
            </Button>
          </div>
        )}

        {gateways.data && gateways.data.length > 0 && (
          <div className="bg-white border border-[#E9ECEF] rounded-xl mt-6 divide-y divide-[#E9ECEF]">
            {gateways.data.map((gateway) => (
              <Link
                key={gateway.id}
                to={`/companies/${companyId}/gateways/${gateway.id}`}
                className="group flex items-center px-5 py-4 hover:bg-[#F8F9FA] transition-colors cursor-pointer"
              >
                <span className="font-mono text-sm bg-[#F8F9FA] border border-[#E9ECEF] rounded-full px-3 py-1 text-[#6C757D] shrink-0">
                  {gateway.prefix}
                </span>
                <span className="ml-4 text-sm text-[#212529] font-medium flex-1">
                  {gateway.label}
                </span>
                <span className="text-xs text-[#ADB5BD] mr-3">
                  {gateway.prefix}/Setconfig
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteId(gateway.id);
                      setDeletePrefix(gateway.prefix);
                      setDeleteOpen(true);
                    }}
                    className="p-2 text-[#ADB5BD] hover:text-[#DC3545] hover:bg-[#FDECEE] rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="Delete Gateway"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-[#ADB5BD] group-hover:text-[#4361EE] transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Add Gateway Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[480px] p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold text-[#212529]">
              Add Gateway{company.data ? ` to ${company.data.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="mt-4 space-y-5">
            <div>
              <Label
                htmlFor="gatewayPrefix"
                className="text-sm font-medium text-[#212529]"
              >
                Gateway Prefix
              </Label>
              <Input
                id="gatewayPrefix"
                value={prefix}
                onChange={(e) => {
                  setPrefix(e.target.value);
                  setPrefixError("");
                }}
                placeholder="e.g. DSA102"
                className={`mt-2 h-10 ${
                  prefixError
                    ? "border-[#DC3545] focus:border-[#DC3545]"
                    : "border-[#E9ECEF] focus:border-[#4361EE]"
                } focus:ring-[#EEF0FE]`}
              />
              <p className="text-xs text-[#6C757D] mt-1.5">
                Must be unique across all companies. Used as the MQTT topic
                prefix.
              </p>
              {prefixError && (
                <p className="text-xs text-[#DC3545] mt-1.5">{prefixError}</p>
              )}
            </div>
            <div>
              <Label
                htmlFor="gatewayLabel"
                className="text-sm font-medium text-[#212529]"
              >
                Label
              </Label>
              <Input
                id="gatewayLabel"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Main Building Sensor"
                className="mt-2 h-10 border-[#E9ECEF] focus:border-[#4361EE] focus:ring-[#EEF0FE]"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setModalOpen(false);
                  setPrefix("");
                  setLabel("");
                  setPrefixError("");
                }}
                className="h-10 px-4 border-[#E9ECEF] text-[#6C757D] hover:bg-[#F8F9FA]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !prefix.trim() ||
                  !label.trim() ||
                  createGateway.isPending
                }
                className="h-10 px-6 bg-[#4361EE] hover:bg-[#3A53D0] text-white disabled:opacity-50"
              >
                {createGateway.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Add Gateway"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Gateway Confirmation Modal */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[480px] p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold text-[#212529] flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-[#DC3545]" />
              Delete Gateway
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <p className="text-sm text-[#6C757D] leading-relaxed">
              Are you sure you want to delete gateway <span className="font-semibold text-[#212529]">{deletePrefix}</span>?
              This will permanently delete the gateway configurations on the server (the device itself will retain its last published configuration). This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteId("");
                  setDeletePrefix("");
                }}
                className="h-10 px-4 border-[#E9ECEF] text-[#6C757D] hover:bg-[#F8F9FA]"
                disabled={deleteGateway.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => deleteGateway.mutate({ id: deleteId })}
                disabled={deleteGateway.isPending}
                className="h-10 px-6 bg-[#DC3545] hover:bg-[#C82333] text-white disabled:opacity-50"
              >
                {deleteGateway.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Delete"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
