"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@shared/ui/AppShell";
import { api } from "@shared/api/client";
import {
  PageContainer,
  PageHeader,
  Button,
  Card,
  Field,
  Select,
  Input,
  Badge,
  Spinner,
} from "@shared/ui/primitives";
import { DataTable, type Column } from "@shared/ui/DataTable";
import { ServiceModal } from "@features/services/ServiceModal";
import { useFormatDate } from "@features/settings/SettingsProvider";
import { useToast } from "@shared/ui/Toast";
import { Plus, Search } from "lucide-react";

interface BookingRow {
  id: string;
  startDatetime: string;
  status: string;
  customer: { name: string | null } | null;
  staff: { name: string | null } | null;
  service: { name: string | null } | null;
}
interface Service {
  id: string;
  name: string;
}

export default function BookingsRoute() {
  return (
    <AppShell>
      <BookingsPage />
    </AppShell>
  );
}

function BookingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const formatDate = useFormatDate();
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<{ start: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [serviceModal, setServiceModal] = useState(false);

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => api.get<{ bookings: BookingRow[] }>("/bookings"),
  });
  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.get<{ services: Service[] }>("/services"),
  });

  const hasServices = (services?.services.length ?? 0) > 0;

  async function loadSlots() {
    setMsg(null);
    setSlots([]);
    setFinding(true);
    try {
      const res = await api.get<{ slots: { start: string }[] }>(
        `/availability?serviceId=${serviceId}&date=${date}`,
      );
      setSlots(res.slots);
      if (res.slots.length === 0) {
        setMsg("No open slots that day. Check the staff schedules for this date.");
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "Could not load slots";
      setMsg(m);
      toast.error(m);
    } finally {
      setFinding(false);
    }
  }
  async function book(start: string) {
    try {
      await api.post("/bookings", { serviceId, startDatetime: start });
      await qc.invalidateQueries({ queryKey: ["bookings"] });
      setSlots([]);
      toast.success("Appointment booked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Booking failed");
    }
  }
  async function cancel(id: string) {
    try {
      await api.patch(`/bookings/${id}`, { action: "cancel" });
      await qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Booking cancelled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    }
  }

  const statusTone = (s: string) =>
    s === "booked"
      ? "accent"
      : s === "cancelled"
        ? "danger"
        : s === "completed"
          ? "success"
          : "neutral";

  const columns: Column<BookingRow>[] = [
    {
      key: "when",
      header: "When",
      render: (b) => formatDate(b.startDatetime),
    },
    { key: "service", header: "Service", render: (b) => b.service?.name ?? "—" },
    { key: "staff", header: "Staff", render: (b) => b.staff?.name ?? "—" },
    { key: "customer", header: "Customer", render: (b) => b.customer?.name ?? "—" },
    {
      key: "status",
      header: "Status",
      render: (b) => <Badge tone={statusTone(b.status)}>{b.status}</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (b) =>
        b.status === "booked" ? (
          <Button size="sm" variant="dangerGhost" onClick={() => cancel(b.id)}>
            Cancel
          </Button>
        ) : null,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Bookings"
        subtitle="View appointments and create new ones."
      />

      <Card className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-text">New booking</h2>
          <Button
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setServiceModal(true)}
          >
            Add service
          </Button>
        </div>
        {!hasServices ? (
          <p className="text-sm text-muted">
            No services yet — add one to start booking.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Service">
              <Select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-44"
              >
                <option value="">Select…</option>
                {services?.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-44"
              />
            </Field>
            <Button
              onClick={loadSlots}
              disabled={!serviceId || !date || finding}
              leftIcon={finding ? <Spinner size={16} /> : <Search size={16} />}
            >
              {finding ? "Finding…" : "Find slots"}
            </Button>
          </div>
        )}
        {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
        {slots.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {slots.map((s) => (
              <Button
                key={s.start}
                size="sm"
                variant="secondary"
                onClick={() => book(s.start)}
              >
                {new Date(s.start).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Button>
            ))}
          </div>
        )}
      </Card>

      <DataTable
        columns={columns}
        rows={isLoading ? [] : (bookings?.bookings ?? [])}
        emptyMessage={isLoading ? "Loading…" : "No bookings yet"}
      />

      <ServiceModal
        open={serviceModal}
        onClose={() => setServiceModal(false)}
        onSaved={(id) => setServiceId(id)}
      />
    </PageContainer>
  );
}
