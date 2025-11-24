"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DetailPage({ params }: { params: { awb: string } }) {
  const { awb } = params;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/dtdc/detail?awb=${awb}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    load();
  }, [awb]);

  if (loading) return <LoadingUI />;
  if (!data?.success) return <ErrorUI message={data?.message || "No data"} />;

  const { summary, currentStatus, timeline, history, reports, consignment } = data;

  return (
    <div className="p-6 space-y-8">
      <Header awb={awb} status={summary.currentStatus} />

      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        <SummaryCard summary={summary} />
        <StatusCard currentStatus={currentStatus} />
        <ReportsCard reports={reports} />
      </div>

      <Timeline timeline={timeline} />

      <ConsignmentDetails consignment={consignment} />

      {history?.length > 0 && <History history={history} />}
    </div>
  );
}

//
// UI COMPONENTS
//

function Header({ awb, status }: any) {
  return (
    <div className="flex justify-between items-center">
      <h1 className="text-2xl font-semibold">
        Shipment Detail – <span className="text-blue-600">{awb}</span>
      </h1>
      <span className="px-4 py-1 rounded bg-blue-100 text-blue-700 text-sm font-medium">
        {status}
      </span>
    </div>
  );
}

function SummaryCard({ summary }: any) {
  return (
    <Card title="Summary">
      <Item label="AWB" value={summary.awb} />
      <Item label="Origin" value={summary.origin} />
      <Item label="Destination" value={summary.destination} />
      <Item label="Booked On" value={summary.bookedOn} />
      <Item label="Last Updated" value={summary.lastUpdatedOn} />
    </Card>
  );
}

function StatusCard({ currentStatus }: any) {
  return (
    <Card title="Current Status">
      <Item label="Status" value={currentStatus.status} />
      <Item label="Date" value={currentStatus.date} />
      <Item label="Location" value={currentStatus.location} />
      <Item label="Remarks" value={currentStatus.remarks} />
    </Card>
  );
}

function ReportsCard({ reports }: any) {
  return (
    <Card title="Reports & Insights">
      <Badge label="Delivered" active={reports.delivered} />
      <Badge label="Out For Delivery" active={reports.outForDelivery} />
      <Badge label="RTO" active={reports.rto} />
      <Badge label="Delayed" active={reports.delayed} />
      <Item label="Last Scan Location" value={reports.lastScanLocation} />
    </Card>
  );
}

function Timeline({ timeline }: any) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Timeline</h2>

      <div className="border-l-2 border-gray-300 pl-4 space-y-6">
        {timeline.map((t: any, i: number) => (
          <div key={i} className="relative">
            <div className="absolute -left-3 w-2 h-2 bg-blue-600 rounded-full"></div>
            <p className="text-sm text-gray-500">{t.date} {t.time}</p>
            <p className="font-medium">{t.action}</p>
            <p className="text-gray-600">{t.origin || t.destination}</p>
            {t.remarks && <p className="text-gray-500 text-sm">{t.remarks}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConsignmentDetails({ consignment }: any) {
  return (
    <Card title="Consignment Info">
      <Item label="Origin" value={consignment.origin} />
      <Item label="Destination" value={consignment.destination} />
      <Item label="Booked On" value={consignment.bookedOn} />
      <Item label="Last Updated" value={consignment.lastUpdatedOn} />
      <Item label="Status" value={consignment.lastStatus} />
    </Card>
  );
}

function History({ history }: any) {
  return (
    <Card title="Status History">
      {history.map((h: any, i: number) => (
        <div key={i} className="mb-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{h.oldStatus} → {h.newStatus}</span>
            <span className="text-gray-500">{h.changedAt}</span>
          </div>
        </div>
      ))}
    </Card>
  );
}

//
// Reusable UI
//

function Card({ title, children }: any) {
  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white space-y-2">
      <h3 className="font-semibold text-lg">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Item({ label, value }: any) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}:</span>
      <span className="font-medium">{value || "-"}</span>
    </div>
  );
}

function Badge({ label, active }: any) {
  return (
    <span
      className={`inline-block px-3 py-1 text-sm rounded-full ${
        active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"
      }`}
    >
      {label}
    </span>
  );
}

//
// Loading / Error
//

function LoadingUI() {
  return (
    <div className="p-6 animate-pulse space-y-4">
      <div className="h-6 bg-gray-200 rounded w-1/3"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      <div className="h-4 bg-gray-200 rounded w-full"></div>
    </div>
  );
}

function ErrorUI({ message }: any) {
  return (
    <div className="p-6 text-red-600 font-medium">
      Error: {message || "Something went wrong"}
    </div>
  );
}
