"use client";

import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";

type Service = { id: number; name: string; description?: string; base_price: string | number };
type Weight = { id: number; min_weight: string | number; max_weight: string | number; price: string | number };
type Config = Record<string, string>;

export default function CourierSettingsPage() {
  const [tab, setTab] = useState<"services" | "weights" | "config">("services");
  const [services, setServices] = useState<Service[]>([]);
  const [weights, setWeights] = useState<Weight[]>([]);
  const [config, setConfig] = useState<Config>({});

  // form states for create/edit
  const [svcForm, setSvcForm] = useState({ id: 0, name: "", description: "", base_price: "" });
  const [wForm, setWForm] = useState({ id: 0, min_weight: "", max_weight: "", price: "" });
  const [cfgKey, setCfgKey] = useState("");
  const [cfgVal, setCfgVal] = useState("");

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    const [sRes, wRes, cRes] = await Promise.all([
      fetch("/api/settings/courier/services").then((r)=>r.json()),
      fetch("/api/settings/courier/weights").then((r)=>r.json()),
      fetch("/api/settings/courier/config").then((r)=>r.json()),
    ]);
    setServices(sRes || []);
    setWeights(wRes || []);
    setConfig(cRes || {});
  }

  // Services CRUD
  async function addService() {
    if (!svcForm.name || svcForm.base_price === "") return toast({ title: "Name and base price required", variant: "destructive" });
    const res = await fetch("/api/settings/courier/services", { method: "POST", body: JSON.stringify(svcForm) });
    const json = await res.json();
    if (res.ok) {
      toast({ title: "Service created" });
      setSvcForm({ id: 0, name: "", description: "", base_price: "" });
      fetchAll();
    } else toast({ title: json.error || "Error", variant: "destructive" });
  }
  async function deleteService(id: number) {
    await fetch(`/api/settings/courier/services?id=${id}`, { method: "DELETE" });
    toast({ title: "Deleted" });
    fetchAll();
  }

  // Weights CRUD
  async function addWeight() {
    if (!wForm.min_weight || !wForm.max_weight || wForm.price === "") return toast({ title: "All fields required", variant: "destructive" });
    const res = await fetch("/api/settings/courier/weights", { method: "POST", body: JSON.stringify(wForm) });
    const json = await res.json();
    if (res.ok) {
      toast({ title: "Weight slab created" });
      setWForm({ id: 0, min_weight: "", max_weight: "", price: "" });
      fetchAll();
    } else toast({ title: json.error || "Error", variant: "destructive" });
  }
  async function deleteWeight(id: number) {
    await fetch(`/api/settings/courier/weights?id=${id}`, { method: "DELETE" });
    toast({ title: "Deleted" });
    fetchAll();
  }

  // Config
  async function setConfigKV() {
    if (!cfgKey) return toast({ title: "Key required", variant: "destructive" });
    // upsert: try PUT first, if 404 then POST
    const put = await fetch("/api/settings/courier/config", { method: "PUT", body: JSON.stringify({ key: cfgKey, value: cfgVal }) });
    if (!put.ok) {
      await fetch("/api/settings/courier/config", { method: "POST", body: JSON.stringify({ key: cfgKey, value: cfgVal }) });
    }
    toast({ title: "Saved" });
    setCfgKey(""); setCfgVal("");
    fetchAll();
  }
  async function deleteConfigKey(key: string) {
    await fetch(`/api/settings/courier/config?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    toast({ title: "Deleted" });
    fetchAll();
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <div className="flex gap-3">
        <Button variant={tab === "services" ? "default" : "ghost"} onClick={() => setTab("services")}>Services</Button>
        <Button variant={tab === "weights" ? "default" : "ghost"} onClick={() => setTab("weights")}>Weight Slabs</Button>
        <Button variant={tab === "config" ? "default" : "ghost"} onClick={() => setTab("config")}>Global Config</Button>
      </div>

      {tab === "services" && (
        <Card>
          <CardHeader><CardTitle>Services</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <Input placeholder="Name" value={svcForm.name} onChange={(e)=>setSvcForm({...svcForm, name:e.target.value})} />
              <Input placeholder="Base Price" value={svcForm.base_price} onChange={(e)=>setSvcForm({...svcForm, base_price:e.target.value})} />
              <Input placeholder="Description" value={svcForm.description} onChange={(e)=>setSvcForm({...svcForm, description:e.target.value})} />
              <div className="col-span-3">
                <Button onClick={addService}>Add Service</Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Base Price</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((s)=>(
                  <TableRow key={s.id}>
                    <TableCell>{s.id}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{s.base_price}</TableCell>
                    <TableCell>{s.description}</TableCell>
                    <TableCell><Button variant="destructive" size="sm" onClick={() => deleteService(s.id)}>Delete</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {tab === "weights" && (
        <Card>
          <CardHeader><CardTitle>Weight Slabs (non-overlapping)</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <Input placeholder="Min weight (kg)" value={wForm.min_weight} onChange={(e)=>setWForm({...wForm, min_weight:e.target.value})} />
              <Input placeholder="Max weight (kg)" value={wForm.max_weight} onChange={(e)=>setWForm({...wForm, max_weight:e.target.value})} />
              <Input placeholder="Price" value={wForm.price} onChange={(e)=>setWForm({...wForm, price:e.target.value})} />
              <div>
                <Button onClick={addWeight}>Add Slab</Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Min</TableHead>
                  <TableHead>Max</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weights.map(w=>(
                  <TableRow key={w.id}>
                    <TableCell>{w.id}</TableCell>
                    <TableCell>{w.min_weight}</TableCell>
                    <TableCell>{w.max_weight}</TableCell>
                    <TableCell>{w.price}</TableCell>
                    <TableCell><Button variant="destructive" size="sm" onClick={()=>deleteWeight(w.id)}>Delete</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {tab === "config" && (
        <Card>
          <CardHeader><CardTitle>Global Config</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <Input placeholder="Key e.g. non_document_surcharge" value={cfgKey} onChange={(e)=>setCfgKey(e.target.value)} />
              <Input placeholder="Value e.g. 30" value={cfgVal} onChange={(e)=>setCfgVal(e.target.value)} />
              <div><Button onClick={setConfigKV}>Save</Button></div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(config).map(([k,v])=>(
                  <TableRow key={k}>
                    <TableCell>{k}</TableCell>
                    <TableCell>{v}</TableCell>
                    <TableCell><Button variant="destructive" size="sm" onClick={()=>deleteConfigKey(k)}>Delete</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
