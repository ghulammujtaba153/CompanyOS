"use client"

import { useState } from "react"
import { Hash, Lock, Search } from "lucide-react"

import { useCommunications, type Channel } from "@/components/dashboard/communications/store"
import { Field, OptionSelect } from "@/components/dashboard/form-controls"
import { useOrganization } from "@/components/dashboard/organization-store"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "cn"
import { initials } from "@/lib/work-utils"

/** Searchable multi-select of active people. */
function PeoplePicker({
  selected,
  onChange,
  exclude = [],
}: {
  selected: string[]
  onChange: (ids: string[]) => void
  exclude?: string[]
}) {
  const { employees } = useOrganization()
  const [query, setQuery] = useState("")
  const people = employees
    .filter((employee) => employee.status !== "Suspended" && !exclude.includes(employee.id))
    .filter((employee) => employee.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className="space-y-2">
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people…" />
      <ul className="max-h-48 divide-y overflow-y-auto rounded-md border">
        {people.map((person) => (
          <li key={person.id}>
            <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={selected.includes(person.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, person.id]
                      : selected.filter((id) => id !== person.id)
                  )
                }
              />
              <span className="flex-1">{person.name}</span>
              <span className="text-xs text-muted-foreground">{person.title}</span>
            </label>
          </li>
        ))}
        {!people.length ? <li className="px-3 py-4 text-center text-sm text-muted-foreground">No one found</li> : null}
      </ul>
    </div>
  )
}

export function CreateChannelDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { createChannel, me } = useCommunications()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [visibility, setVisibility] = useState<Channel["visibility"]>("Public")
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    setError("")
    try {
      const result = await createChannel({ name, description, visibility, memberIds })
      if (!result.ok) return setError(result.message)
      onCreated(result.id!)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New channel</DialogTitle>
        </DialogHeader>
        <form
          id="channel-form"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field label="Name" htmlFor="channel-name">
            <div className="relative">
              <Hash className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="channel-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value.toLowerCase().replace(/\s+/g, "-"))}
                placeholder="product-launch"
                className="pl-8"
              />
            </div>
          </Field>
          <Field label="Description" htmlFor="channel-description">
            <Textarea
              id="channel-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this channel about?"
              className="min-h-16"
            />
          </Field>
          <Field label="Visibility">
            <OptionSelect<Channel["visibility"]>
              value={visibility}
              options={["Public", "Private"]}
              onChange={setVisibility}
            />
            <p className="text-xs text-muted-foreground">
              {visibility === "Public"
                ? "Anyone in the workspace can find and join."
                : "Only invited members can see it."}
            </p>
          </Field>
          <Field label="Add members">
            <PeoplePicker selected={memberIds} onChange={setMemberIds} exclude={me ? [me.id] : []} />
          </Field>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="channel-form" loading={saving}>
            {saving ? "Creating…" : "Create channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BrowseChannelsDialog({
  onClose,
  onJoined,
}: {
  onClose: () => void
  onJoined: (id: string) => void
}) {
  const { joinableChannels, joinChannel } = useCommunications()
  const [query, setQuery] = useState("")
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const list = joinableChannels.filter((channel) =>
    `${channel.name} ${channel.description}`.toLowerCase().includes(query.trim().toLowerCase())
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Browse channels</DialogTitle>
          <DialogDescription>Public channels you haven&apos;t joined yet.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search channels…" className="pl-8" />
        </div>
        <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
          {list.map((channel) => (
            <li key={channel.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium"># {channel.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {channel.memberIds.length} members{channel.description ? ` · ${channel.description}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                loading={joiningId === channel.id}
                onClick={async () => {
                  setJoiningId(channel.id)
                  try {
                    await joinChannel(channel.id)
                    onJoined(channel.id)
                  } finally {
                    setJoiningId(null)
                  }
                }}
              >
                {joiningId === channel.id ? "Joining…" : "Join"}
              </Button>
            </li>
          ))}
          {!list.length ? (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">No channels to join.</li>
          ) : null}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

export function NewMessageDialog({
  onClose,
  onOpen,
}: {
  onClose: () => void
  onOpen: (channelId: string) => void
}) {
  const { employees } = useOrganization()
  const { openDirectMessage, me } = useCommunications()
  const [query, setQuery] = useState("")
  const [openingId, setOpeningId] = useState<string | null>(null)
  const people = employees.filter(
    (employee) =>
      employee.status === "Active" &&
      employee.id !== me?.id &&
      `${employee.name} ${employee.title}`.toLowerCase().includes(query.trim().toLowerCase())
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New direct message</DialogTitle>
        </DialogHeader>
        <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a person…" />
        <ul className="max-h-72 overflow-y-auto">
          {people.map((person) => (
            <li key={person.id}>
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start gap-3 rounded-md px-2 py-2"
                loading={openingId === person.id}
                disabled={Boolean(openingId)}
                onClick={async () => {
                  setOpeningId(person.id)
                  try {
                    const id = await openDirectMessage(person.id)
                    onOpen(id)
                  } finally {
                    setOpeningId(null)
                  }
                }}
              >
                <Avatar size="sm">
                  <AvatarFallback>{initials(person.name)}</AvatarFallback>
                </Avatar>
                <span className="flex-1 text-left text-sm">{person.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{person.title}</span>
              </Button>
            </li>
          ))}
          {!people.length ? (
            <li className="py-6 text-center text-sm text-muted-foreground">No one found</li>
          ) : null}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

export function ChannelDetailsDialog({
  channel,
  onClose,
  onLeft,
}: {
  channel: Channel
  onClose: () => void
  onLeft: () => void
}) {
  const { employees } = useOrganization()
  const { updateChannel, deleteChannel, leaveChannel, addMembers, canModerate, me } = useCommunications()
  const moderator = canModerate(channel)
  const [name, setName] = useState(channel.name)
  const [description, setDescription] = useState(channel.description)
  const [adding, setAdding] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<"leave" | "delete" | null>(null)
  const members = employees.filter((employee) => channel.memberIds.includes(employee.id))

  async function save() {
    setSaving(true)
    setError("")
    try {
      if (moderator) {
        const result = await updateChannel(channel.id, { name, description })
        if (!result.ok) return setError(result.message)
      }
      if (adding.length) await addMembers(channel.id, adding)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {channel.visibility === "Private" ? <Lock className="size-4" /> : <Hash className="size-4" />}
            {channel.name}
          </DialogTitle>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
          {moderator ? (
            <>
              <Field label="Name" htmlFor="edit-channel-name">
                <Input
                  id="edit-channel-name"
                  value={name}
                  disabled={channel.name === "general"}
                  onChange={(event) => setName(event.target.value.toLowerCase().replace(/\s+/g, "-"))}
                />
              </Field>
              <Field label="Description" htmlFor="edit-channel-description">
                <Textarea
                  id="edit-channel-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-16"
                />
              </Field>
            </>
          ) : channel.description ? (
            <p className="text-sm text-muted-foreground">{channel.description}</p>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-medium">Members ({members.length})</p>
            <ul className="max-h-40 space-y-1.5 overflow-y-auto">
              {members.map((member) => (
                <li key={member.id} className="flex items-center gap-2 text-sm">
                  <Avatar size="sm" className="size-6">
                    <AvatarFallback className="text-[10px]">{initials(member.name)}</AvatarFallback>
                  </Avatar>
                  {member.name}
                  {member.id === me?.id ? <span className="text-xs text-muted-foreground">(you)</span> : null}
                </li>
              ))}
            </ul>
          </div>

          <Field label="Add people">
            <PeoplePicker selected={adding} onChange={setAdding} exclude={channel.memberIds} />
          </Field>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Separator />
        <DialogFooter className="sm:justify-between">
          <div className="flex gap-2">
            {channel.name !== "general" ? (
              <Button
                variant="ghost"
                loading={busy === "leave"}
                disabled={Boolean(busy) || saving}
                onClick={async () => {
                  setBusy("leave")
                  try {
                    await leaveChannel(channel.id)
                    onLeft()
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                {busy === "leave" ? "Leaving…" : "Leave"}
              </Button>
            ) : null}
            {moderator && channel.name !== "general" ? (
              <Button
                variant="ghost"
                className={cn("text-destructive", confirmDelete && "bg-destructive/10")}
                loading={busy === "delete"}
                disabled={Boolean(busy) || saving}
                onClick={async () => {
                  if (!confirmDelete) return setConfirmDelete(true)
                  setBusy("delete")
                  setError("")
                  try {
                    const result = await deleteChannel(channel.id)
                    if (!result.ok) return setError(result.message)
                    onLeft()
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                {busy === "delete" ? "Deleting…" : confirmDelete ? "Click again to delete" : "Delete channel"}
              </Button>
            ) : null}
          </div>
          <Button
            loading={saving}
            disabled={(!moderator && !adding.length) || Boolean(busy)}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
