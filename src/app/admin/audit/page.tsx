import { AuditLog } from "@/components/admin/audit-log";
import { ChangeLog } from "@/components/admin/change-log";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Page() {
  return (
    <div className="space-y-5">
      <AdminPageHeader title="Audit log" />
      <Tabs defaultValue="actions">
        <TabsList>
          <TabsTrigger value="actions">Staff actions</TabsTrigger>
          <TabsTrigger value="changes">All changes</TabsTrigger>
        </TabsList>
        <TabsContent value="actions" className="mt-4">
          <AuditLog />
        </TabsContent>
        <TabsContent value="changes" className="mt-4">
          <ChangeLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}
