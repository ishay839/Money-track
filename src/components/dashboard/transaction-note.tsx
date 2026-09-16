"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { updateTransactionNote } from "@/lib/api";

export function TransactionNote({ id, note }: { id: number; note: string | null }) {
  const [editing,setEditing] = useState(false);
  const [draft,setDraft] = useState(note ?? "");
  const [saving,setSaving] = useState(false);
  const queryClient = useQueryClient();
  useEffect(()=>setDraft(note ?? ""),[note]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateTransactionNote(id,draft.trim() || null);
      await Promise.all([
        queryClient.invalidateQueries({queryKey:["transactions"]}),
        queryClient.invalidateQueries({queryKey:["category-detail"]}),
      ]);
      setEditing(false);
      toast.success("ההערה נשמרה");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירת ההערה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) return <button type="button" onClick={()=>setEditing(true)} className="mt-1 inline-flex max-w-full items-center gap-1 text-start text-xs text-muted-foreground hover:text-foreground" title={note?"עריכת הערה":"הוספת הערה"}><Pencil className="h-3 w-3 shrink-0"/><span className="truncate">{note?`הערה: ${note}`:"הוספת הערה"}</span></button>;

  return <form className="mt-1 flex max-w-md items-center gap-1" onSubmit={event=>{event.preventDefault();void save();}}><input autoFocus maxLength={500} aria-label="הערה אישית לתנועה" placeholder="למשל: התקנת עמדה חשמלית" value={draft} onChange={event=>setDraft(event.target.value)} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"/><button type="submit" disabled={saving} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent" title="שמירת הערה"><Check className="h-4 w-4"/></button><button type="button" disabled={saving} onClick={()=>{setDraft(note??"");setEditing(false);}} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent" title="ביטול"><X className="h-4 w-4"/></button></form>;
}
