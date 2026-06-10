// import { useState } from "react";
// import { Link } from "react-router";
// import { Plus, ChevronRight, Building2, Loader2, Trash2, AlertTriangle } from "lucide-react";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { trpc } from "@/providers/trpc";
// import Navbar from "@/components/Navbar";

// export default function CompanyList() {
//   const [modalOpen, setModalOpen] = useState(false);
//   const [companyName, setCompanyName] = useState("");

//   const [deleteOpen, setDeleteOpen] = useState(false);
//   const [deleteId, setDeleteId] = useState("");
//   const [deleteName, setDeleteName] = useState("");

//   const utils = trpc.useUtils();
//   const companies = trpc.company.list.useQuery();
//   const createCompany = trpc.company.create.useMutation({
//     onSuccess: () => {
//       utils.company.list.invalidate();
//       setModalOpen(false);
//       setCompanyName("");
//     },
//   });

//   const deleteCompany = trpc.company.delete.useMutation({
//     onSuccess: () => {
//       utils.company.list.invalidate();
//       setDeleteOpen(false);
//       setDeleteId("");
//       setDeleteName("");
//     },
//   });

//   const handleCreate = (e) => {
//     e.preventDefault();
//     const trimmed = companyName.trim();
//     if (!trimmed) return;
//     createCompany.mutate({ name: trimmed });
//   };

//   return (
//     <div className="min-h-screen bg-[#F8F9FA]">
//       <Navbar />
//       <main className="max-w-[1400px] mx-auto p-6">
//         <div className="flex items-center justify-between mb-6">
//           <h1 className="text-2xl font-semibold text-[#212529] tracking-tight">
//             Companies
//           </h1>
//           <Button
//             onClick={() => setModalOpen(true)}
//             className="bg-[#4361EE] hover:bg-[#3A53D0] text-white h-10 px-4"
//           >
//             <Plus className="w-4 h-4 mr-2" />
//             New Company
//           </Button>
//         </div>

//         {companies.isLoading && (
//           <div className="flex items-center justify-center py-20">
//             <Loader2 className="w-6 h-6 animate-spin text-[#4361EE]" />
//           </div>
//         )}

//         {companies.isError && (
//           <div className="text-center py-20 text-[#DC3545]">
//             Failed to load companies. Please try again.
//           </div>
//         )}

//         {companies.data && companies.data.length === 0 && (
//           <div className="flex flex-col items-center justify-center py-20">
//             <Building2 className="w-16 h-16 text-[#ADB5BD] mb-4" />
//             <p className="text-[#6C757D] text-lg mb-2">No companies yet</p>
//             <p className="text-[#ADB5BD] text-sm mb-6">
//               Create your first company to get started
//             </p>
//             <Button
//               onClick={() => setModalOpen(true)}
//               className="bg-[#4361EE] hover:bg-[#3A53D0] text-white"
//             >
//               <Plus className="w-4 h-4 mr-2" />
//               New Company
//             </Button>
//           </div>
//         )}

//         {companies.data && companies.data.length > 0 && (
//           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//             {companies.data.map((company) => (
//               <Link
//                 key={company.id}
//                 to={`/companies/${company.id}`}
//                 className="group bg-white border border-[#E9ECEF] rounded-xl p-6 hover:border-[#4361EE] transition-colors duration-200 cursor-pointer"
//               >
//                 <div className="flex items-center justify-between">
//                   <div className="flex-1 min-w-0 pr-4">
//                     <h3 className="text-base font-semibold text-[#212529] mb-1 truncate">
//                       {company.name}
//                     </h3>
//                     <CompanyGatewayCount companyId={company.id} />
//                   </div>
//                   <div className="flex items-center gap-2">
//                     <button
//                       onClick={(e) => {
//                         e.preventDefault();
//                         e.stopPropagation();
//                         setDeleteId(company.id);
//                         setDeleteName(company.name);
//                         setDeleteOpen(true);
//                       }}
//                       className="p-2 text-[#ADB5BD] hover:text-[#DC3545] hover:bg-[#FDECEE] rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
//                       title="Delete Company"
//                     >
//                       <Trash2 className="w-4.5 h-4.5" />
//                     </button>
//                     <ChevronRight className="w-5 h-5 text-[#ADB5BD] group-hover:text-[#4361EE] transition-colors" />
//                   </div>
//                 </div>
//               </Link>
//             ))}
//           </div>
//         )}
//       </main>

//       {/* New Company Modal */}
//       <Dialog open={modalOpen} onOpenChange={setModalOpen}>
//         <DialogContent className="sm:max-w-[480px] p-8">
//           <DialogHeader>
//             <DialogTitle className="text-2xl font-semibold text-[#212529]">
//               New Company
//             </DialogTitle>
//           </DialogHeader>
//           <form onSubmit={handleCreate} className="mt-4 space-y-6">
//             <div>
//               <Label
//                 htmlFor="companyName"
//                 className="text-sm font-medium text-[#212529]"
//               >
//                 Company Name
//               </Label>
//               <Input
//                 id="companyName"
//                 value={companyName}
//                 onChange={(e) => setCompanyName(e.target.value)}
//                 placeholder="e.g. Acme Industries"
//                 className="mt-2 h-10 border-[#E9ECEF] focus:border-[#4361EE] focus:ring-[#EEF0FE]"
//                 autoFocus
//               />
//             </div>
//             <div className="flex justify-end gap-3">
//               <Button
//                 type="button"
//                 variant="outline"
//                 onClick={() => {
//                   setModalOpen(false);
//                   setCompanyName("");
//                 }}
//                 className="h-10 px-4 border-[#E9ECEF] text-[#6C757D] hover:bg-[#F8F9FA]"
//               >
//                 Cancel
//               </Button>
//               <Button
//                 type="submit"
//                 disabled={!companyName.trim() || createCompany.isPending}
//                 className="h-10 px-6 bg-[#4361EE] hover:bg-[#3A53D0] text-white disabled:opacity-50"
//               >
//                 {createCompany.isPending ? (
//                   <Loader2 className="w-4 h-4 animate-spin" />
//                 ) : (
//                   "Create"
//                 )}
//               </Button>
//             </div>
//           </form>
//         </DialogContent>
//       </Dialog>

//       {/* Delete Confirmation Modal */}
//       <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
//         <DialogContent className="sm:max-w-[480px] p-8">
//           <DialogHeader>
//             <DialogTitle className="text-2xl font-semibold text-[#212529] flex items-center gap-2">
//               <AlertTriangle className="w-6 h-6 text-[#DC3545]" />
//               Delete Company
//             </DialogTitle>
//           </DialogHeader>
//           <div className="mt-4 space-y-4">
//             <p className="text-sm text-[#6C757D] leading-relaxed">
//               Are you sure you want to delete <span className="font-semibold text-[#212529]">{deleteName}</span>?
//               This will permanently delete the company and <strong>all gateways</strong> associated with it. This action cannot be undone.
//             </p>
//             <div className="flex justify-end gap-3 pt-4">
//               <Button
//                 type="button"
//                 variant="outline"
//                 onClick={() => {
//                   setDeleteOpen(false);
//                   setDeleteId("");
//                   setDeleteName("");
//                 }}
//                 className="h-10 px-4 border-[#E9ECEF] text-[#6C757D] hover:bg-[#F8F9FA]"
//                 disabled={deleteCompany.isPending}
//               >
//                 Cancel
//               </Button>
//               <Button
//                 onClick={() => deleteCompany.mutate({ id: deleteId })}
//                 disabled={deleteCompany.isPending}
//                 className="h-10 px-6 bg-[#DC3545] hover:bg-[#C82333] text-white disabled:opacity-50"
//               >
//                 {deleteCompany.isPending ? (
//                   <Loader2 className="w-4 h-4 animate-spin" />
//                 ) : (
//                   "Delete"
//                 )}
//               </Button>
//             </div>
//           </div>
//         </DialogContent>
//       </Dialog>
//     </div>
//   );
// }

// // Sub-component to fetch gateway count per company
// function CompanyGatewayCount({ companyId }) {
//   const gateways = trpc.gateway.listByCompany.useQuery({ companyId });
//   const count = gateways.data?.length ?? 0;
//   return (
//     <p className="text-xs text-[#6C757D] uppercase tracking-wider">
//       {count} gateway{count !== 1 ? "s" : ""} configured
//     </p>
//   );
// }


import { useState } from "react";
import { Link } from "react-router";
import {
  Plus,
  ChevronRight,
  Building2,
  Loader2,
  Trash2,
  AlertTriangle,
} from "lucide-react";

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

export default function CompanyList() {
  const [companyName, setCompanyName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  const [deleteName, setDeleteName] = useState("");

  const utils = trpc.useUtils();

  const companies = trpc.company.list.useQuery();

  const createCompany = trpc.company.create.useMutation({
    onSuccess: () => {
      utils.company.list.invalidate();
      setCompanyName("");
    },
  });

  const deleteCompany = trpc.company.delete.useMutation({
    onSuccess: () => {
      utils.company.list.invalidate();
      setDeleteOpen(false);
      setDeleteId("");
      setDeleteName("");
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();

    const trimmed = companyName.trim();
    if (!trimmed) return;

    createCompany.mutate({ name: trimmed });
  };

  /* =========================
     SEARCH FILTER (FIXED)
  ========================= */
  const filteredCompanies =
    companies.data?.filter((company) =>
      company.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <Navbar />

      <main className="max-w-[1400px] mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">

          {/* LEFT: CREATE (30%) */}
          <div className="lg:col-span-3">
            <div className="bg-white border border-[#E9ECEF] rounded-xl p-6 sticky top-6">
              <h2 className="text-xl font-semibold text-[#212529] mb-6">
                Create Company
              </h2>

              <form onSubmit={handleCreate} className="space-y-5">
                <div>
                  <Label htmlFor="companyName">
                    Company Name
                  </Label>

                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Industries"
                    className="mt-2 h-10 border-[#E9ECEF] focus:border-[#4361EE] focus:ring-[#EEF0FE]"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={
                    !companyName.trim() || createCompany.isPending
                  }
                  className="w-full bg-[#4361EE] hover:bg-[#3A53D0] text-white transition-colors p-2"
                >
                  {createCompany.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Company
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>

          {/* RIGHT: LIST (70%) */}
          <div className="lg:col-span-7">

            {/* HEADER + SEARCH */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-semibold text-[#212529]">
                Companies
              </h1>

              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search companies..."
                className="w-64 h-10 border-[#E9ECEF] focus:border-[#4361EE] focus:ring-[#EEF0FE]"
              />
            </div>

            {/* LOADING */}
            {companies.isLoading && (
              <div className="flex justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-[#4361EE]" />
              </div>
            )}

            {/* ERROR */}
            {companies.isError && (
              <div className="text-center py-20 text-[#DC3545]">
                Failed to load companies. Please try again.
              </div>
            )}

            {/* EMPTY (NO DATA AT ALL) */}
            {companies.data?.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-[#E9ECEF]">
                <Building2 className="w-14 h-14 text-[#ADB5BD] mb-4" />
                <p className="text-[#6C757D] text-lg">
                  No companies yet
                </p>
                <p className="text-[#ADB5BD] text-sm">
                  Create your first company from the left panel
                </p>
              </div>
            )}

            {/* EMPTY (SEARCH RESULT) */}
            {companies.data?.length > 0 &&
              filteredCompanies.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-[#E9ECEF]">
                  <Building2 className="w-14 h-14 text-[#ADB5BD] mb-4" />
                  <p className="text-[#6C757D] text-lg">
                    No companies found
                  </p>
                  <p className="text-[#ADB5BD] text-sm">
                    Try adjusting your search
                  </p>
                </div>
              )}

            {/* LIST (ONE BY ONE) */}
            {filteredCompanies.length > 0 && (
              <div className="flex flex-col gap-3">
                {filteredCompanies.map((company) => (
                  <Link
                    key={company.id}
                    to={`/companies/${company.id}`}
                    className="group flex items-center justify-between bg-white border border-[#E9ECEF] rounded-xl px-5 py-4 hover:border-[#4361EE] transition-colors"
                  >
                    {/* LEFT */}
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[#212529] truncate">
                        {company.name}
                      </h3>

                      <CompanyGatewayCount
                        companyId={company.id}
                      />
                    </div>

                    {/* RIGHT */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();

                          setDeleteId(company.id);
                          setDeleteName(company.name);
                          setDeleteOpen(true);
                        }}
                        className="p-2 text-[#ADB5BD] hover:text-[#DC3545] hover:bg-[#FDECEE] rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <ChevronRight className="w-5 h-5 text-[#ADB5BD] group-hover:text-[#4361EE]" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* DELETE MODAL */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[480px] p-8">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl font-semibold text-[#212529]">
              <AlertTriangle className="w-6 h-6 text-[#DC3545]" />
              Delete Company
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <p className="text-sm text-[#6C757D]">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-[#212529]">
                {deleteName}
              </span>
              ? This action cannot be undone.
            </p>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteId("");
                  setDeleteName("");
                }}
                className="border-[#E9ECEF] text-[#6C757D] hover:bg-[#F8F9FA]"
              >
                Cancel
              </Button>

              <Button
                onClick={() =>
                  deleteCompany.mutate({ id: deleteId })
                }
                disabled={deleteCompany.isPending}
                className="bg-[#DC3545] hover:bg-[#C82333] text-white"
              >
                {deleteCompany.isPending ? (
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

/* =========================
   Gateway Count Component
========================= */
function CompanyGatewayCount({ companyId }) {
  const gateways = trpc.gateway.listByCompany.useQuery({
    companyId,
  });

  const count = gateways.data?.length ?? 0;

  return (
    <p className="text-xs text-[#6C757D] uppercase tracking-wider mt-1">
      {count} gateway{count !== 1 ? "s" : ""} configured
    </p>
  );
}