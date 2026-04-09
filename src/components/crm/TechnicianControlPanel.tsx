"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { OperationsDashboardData, WorkforceRoleKey } from "@/lib/operations-data";

import styles from "./crm.module.css";

interface TeamControlPanelProps {
  teamRoster: OperationsDashboardData["teamRoster"];
  canManage: boolean;
}

type DayToken = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
type TeamRoleFilter = WorkforceRoleKey | "all";

interface TeamActionPayload {
  action: "add" | "remove" | "leave" | "return" | "update";
  role: WorkforceRoleKey;
  label: string;
  positionLabel: string;
  previousRole?: WorkforceRoleKey;
  previousLabel?: string;
  daysOff: string[];
}

interface TeamMemberDraft {
  firstName: string;
  surname: string;
  roleKey: WorkforceRoleKey;
  positionLabel: string;
  daysOff: DayToken[];
  onLeave: boolean;
}

interface EditableMemberSnapshot {
  id: string;
  roleKey: WorkforceRoleKey;
  label: string;
  positionLabel: string;
  daysOff: string[];
  onLeave: boolean;
}

interface PreviousEditableSnapshot {
  id: string;
  roleKey: WorkforceRoleKey;
  label: string;
  positionLabel: string;
  daysOff: string[];
}

const dayOrder: DayToken[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const roleMeta: Array<{ key: TeamRoleFilter; label: string }> = [
  { key: "all", label: "All Team Roles" },
  { key: "technicians", label: "Technicians" },
  { key: "riggers", label: "Riggers" },
  { key: "shipwrights", label: "Shipwrights" },
  { key: "acTechs", label: "AC Techs" },
];

export function TeamControlPanel({ teamRoster, canManage }: TeamControlPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [roleFilter, setRoleFilter] = useState<TeamRoleFilter>("all");
  const [dayFilter, setDayFilter] = useState<DayToken | "all">(getCurrentDayToken());
  const [onDutyRoleView, setOnDutyRoleView] = useState<WorkforceRoleKey | null>(null);
  const [query, setQuery] = useState("");
  const [previousDropdownOpen, setPreviousDropdownOpen] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [addDraft, setAddDraft] = useState<TeamMemberDraft>(buildDefaultDraft("technicians"));
  const [editing, setEditing] = useState<{
    original: EditableMemberSnapshot;
    draft: TeamMemberDraft;
  } | null>(null);
  const [previousEditing, setPreviousEditing] = useState<{
    original: PreviousEditableSnapshot;
    draft: TeamMemberDraft;
  } | null>(null);

  const allMembers = useMemo(
    () =>
      teamRoster.members.map((member) => ({
        ...member,
        daysOff: normalizeDayList(member.daysOff),
        todayVessels: [...new Set(member.todayVessels)].sort((left, right) => left.localeCompare(right)),
      })),
    [teamRoster.members],
  );

  const onDutyMembersByRole = useMemo(
    () => ({
      technicians: allMembers
        .filter((member) => member.roleKey === "technicians" && member.availableToday && !member.onLeave)
        .sort((left, right) => left.label.localeCompare(right.label)),
      riggers: allMembers
        .filter((member) => member.roleKey === "riggers" && member.availableToday && !member.onLeave)
        .sort((left, right) => left.label.localeCompare(right.label)),
      shipwrights: allMembers
        .filter((member) => member.roleKey === "shipwrights" && member.availableToday && !member.onLeave)
        .sort((left, right) => left.label.localeCompare(right.label)),
      acTechs: allMembers
        .filter((member) => member.roleKey === "acTechs" && member.availableToday && !member.onLeave)
        .sort((left, right) => left.label.localeCompare(right.label)),
    }),
    [allMembers],
  );

  const onDutyCards: Array<{ role: WorkforceRoleKey; label: string; members: typeof allMembers }> = [
    {
      role: "technicians",
      label: "Technicians On Today",
      members: onDutyMembersByRole.technicians,
    },
    {
      role: "riggers",
      label: "Riggers On Today",
      members: onDutyMembersByRole.riggers,
    },
    {
      role: "shipwrights",
      label: "Shipwrights On Today",
      members: onDutyMembersByRole.shipwrights,
    },
    {
      role: "acTechs",
      label: "AC Techs On Today",
      members: onDutyMembersByRole.acTechs,
    },
  ];

  const selectedOnDutyMembers = onDutyRoleView ? onDutyMembersByRole[onDutyRoleView] : [];

  const searchedMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return allMembers.filter((member) => {
      if (roleFilter !== "all" && member.roleKey !== roleFilter) {
        return false;
      }

      if (dayFilter !== "all" && !isMemberAvailableOnDay(member, dayFilter)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchable = [
        member.label.toLowerCase(),
        member.roleLabel.toLowerCase(),
        member.positionLabel.toLowerCase(),
        member.daysOff.join(" ").toLowerCase(),
      ];

      return searchable.some((value) => value.includes(normalizedQuery));
    });
  }, [allMembers, dayFilter, query, roleFilter]);

  const previousMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return teamRoster.previousMembers
      .filter((member) => (roleFilter === "all" ? true : member.roleKey === roleFilter))
      .filter((member) => {
        if (!normalizedQuery) {
          return true;
        }
        return (
          member.label.toLowerCase().includes(normalizedQuery) ||
          member.positionLabel.toLowerCase().includes(normalizedQuery) ||
          member.roleLabel.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((left, right) => right.removedAtMs - left.removedAtMs);
  }, [query, roleFilter, teamRoster.previousMembers]);

  const searchSuggestions = useMemo(() => {
    const names = new Set<string>();
    for (const member of teamRoster.members) {
      names.add(member.label);
    }
    for (const member of teamRoster.previousMembers) {
      names.add(member.label);
    }
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [teamRoster.members, teamRoster.previousMembers]);

  const roleGroupSuggestions = useMemo(() => {
    const labels = new Set<string>([
      "Technician",
      "Rigger",
      "Shipwright",
      "AC Tech",
      "FG",
    ]);
    for (const member of teamRoster.members) {
      if (member.positionLabel?.trim()) {
        labels.add(member.positionLabel.trim());
      }
    }
    for (const member of teamRoster.previousMembers) {
      if (member.positionLabel?.trim()) {
        labels.add(member.positionLabel.trim());
      }
    }
    return [...labels].sort((left, right) => left.localeCompare(right));
  }, [teamRoster.members, teamRoster.previousMembers]);

  const statusDay = dayFilter === "all" ? getCurrentDayToken() : dayFilter;

  async function sendTeamAction(payload: TeamActionPayload) {
    const response = await fetch("/api/team-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

    if (!response.ok || !json?.ok) {
      throw new Error(json?.error || "Could not save team change.");
    }
  }

  function refreshData() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function applyAction(
    busyKey: string,
    task: () => Promise<void>,
    successMessage: string,
  ): Promise<boolean> {
    setActionBusyKey(busyKey);
    setError(null);
    setFeedback(null);
    try {
      await task();
      setFeedback(successMessage);
      refreshData();
      return true;
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Could not save team change.";
      setError(message);
      return false;
    } finally {
      setActionBusyKey(null);
    }
  }

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || adding) {
      return;
    }

    const label = joinName(addDraft.firstName, addDraft.surname);
    if (!label) {
      setError("Name and surname are required.");
      return;
    }

    const positionLabel = addDraft.positionLabel.trim() || defaultPositionForRole(addDraft.roleKey);
    const daysOff = addDraft.daysOff;

    setAdding(true);
    setError(null);
    setFeedback(null);
    try {
      await sendTeamAction({
        action: "add",
        role: addDraft.roleKey,
        label,
        positionLabel,
        daysOff,
      });

      if (addDraft.onLeave) {
        await sendTeamAction({
          action: "leave",
          role: addDraft.roleKey,
          label,
          positionLabel,
          daysOff,
        });
      }

      setFeedback(`Added ${label} to the team roster.`);
      setAddDraft(buildDefaultDraft(addDraft.roleKey));
      setShowAddForm(false);
      refreshData();
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Could not save team change.";
      setError(message);
    } finally {
      setAdding(false);
    }
  }

  function startEdit(member: OperationsDashboardData["teamRoster"]["members"][number]) {
    setError(null);
    setFeedback(null);
    const split = splitName(member.label);
    setEditing({
      original: {
        id: member.id,
        roleKey: member.roleKey,
        label: member.label,
        positionLabel: member.positionLabel,
        daysOff: normalizeDayList(member.daysOff),
        onLeave: member.onLeave,
      },
      draft: {
        firstName: split.firstName,
        surname: split.surname,
        roleKey: member.roleKey,
        positionLabel: member.positionLabel,
        daysOff: normalizeDayList(member.daysOff),
        onLeave: member.onLeave,
      },
    });
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) {
      return;
    }

    const nextLabel = joinName(editing.draft.firstName, editing.draft.surname);
    if (!nextLabel) {
      setError("Name and surname are required.");
      return;
    }

    const nextRole = editing.draft.roleKey;
    const nextPosition = editing.draft.positionLabel.trim() || defaultPositionForRole(nextRole);
    const nextDaysOff = editing.draft.daysOff;
    const nextLeave = editing.draft.onLeave;

    const oldNormalized = normalizeLabel(editing.original.label);
    const newNormalized = normalizeLabel(nextLabel);
    const identityChanged = oldNormalized !== newNormalized || editing.original.roleKey !== nextRole;

    const updated = await applyAction(
      `edit-${editing.original.id}`,
      async () => {
        if (identityChanged) {
          await sendTeamAction({
            action: "update",
            role: nextRole,
            label: nextLabel,
            positionLabel: nextPosition,
            previousRole: editing.original.roleKey,
            previousLabel: editing.original.label,
            daysOff: nextDaysOff,
          });
          if (nextLeave) {
            await sendTeamAction({
              action: "leave",
              role: nextRole,
              label: nextLabel,
              positionLabel: nextPosition,
              daysOff: nextDaysOff,
            });
          }
          return;
        }

        await sendTeamAction({
          action: "add",
          role: nextRole,
          label: nextLabel,
          positionLabel: nextPosition,
          daysOff: nextDaysOff,
        });

        if (editing.original.onLeave !== nextLeave) {
          await sendTeamAction({
            action: nextLeave ? "leave" : "return",
            role: nextRole,
            label: nextLabel,
            positionLabel: nextPosition,
            daysOff: nextDaysOff,
          });
        }
      },
      `Updated ${nextLabel}.`,
    );

    if (updated) {
      setEditing(null);
    }
  }

  function startPreviousEdit(member: OperationsDashboardData["teamRoster"]["previousMembers"][number]) {
    setError(null);
    setFeedback(null);
    const split = splitName(member.label);
    setPreviousEditing({
      original: {
        id: member.id,
        roleKey: member.roleKey,
        label: member.label,
        positionLabel: member.positionLabel,
        daysOff: normalizeDayList(member.daysOff),
      },
      draft: {
        firstName: split.firstName,
        surname: split.surname,
        roleKey: member.roleKey,
        positionLabel: member.positionLabel,
        daysOff: normalizeDayList(member.daysOff),
        onLeave: false,
      },
    });
  }

  function cancelPreviousEdit() {
    setPreviousEditing(null);
  }

  async function savePreviousEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!previousEditing) {
      return;
    }

    const nextLabel = joinName(previousEditing.draft.firstName, previousEditing.draft.surname);
    if (!nextLabel) {
      setError("Name and surname are required.");
      return;
    }

    const nextRole = previousEditing.draft.roleKey;
    const nextPosition = previousEditing.draft.positionLabel.trim() || defaultPositionForRole(nextRole);
    const nextDaysOff = previousEditing.draft.daysOff;
    const oldNormalized = normalizeLabel(previousEditing.original.label);
    const newNormalized = normalizeLabel(nextLabel);
    const identityChanged = oldNormalized !== newNormalized || previousEditing.original.roleKey !== nextRole;

    const updated = await applyAction(
      `restore-edit-${previousEditing.original.id}`,
      async () => {
        if (identityChanged) {
          await sendTeamAction({
            action: "return",
            role: previousEditing.original.roleKey,
            label: previousEditing.original.label,
            positionLabel: previousEditing.original.positionLabel,
            daysOff: previousEditing.original.daysOff,
          });
        }

        await sendTeamAction({
          action: "add",
          role: nextRole,
          label: nextLabel,
          positionLabel: nextPosition,
          daysOff: nextDaysOff,
        });
      },
      `${nextLabel} added back to active roster.`,
    );

    if (updated) {
      setPreviousEditing(null);
      setPreviousDropdownOpen(false);
    }
  }

  const totalRosterCount = teamRoster.members.length;
  const filteredCount = searchedMembers.length;

  return (
    <div className={styles.pageStack}>
      <section className={styles.heroCard}>
        <div>
          <h1 className={styles.pageTitle}>Team Control</h1>
          <p className={styles.pageSubtitle}>
            Manage active crew, role assignments, days off, and rapid leave/remove updates for daily planning.
          </p>
        </div>
      </section>

      <section className={styles.metricGrid}>
        {onDutyCards.map((card) => {
          const isActive = onDutyRoleView === card.role;

          return (
            <button
              key={card.role}
              type="button"
              className={
                isActive
                  ? `${styles.metricCard} ${styles.onDutyCard} ${styles.onDutyCardActive}`
                  : `${styles.metricCard} ${styles.onDutyCard}`
              }
              onClick={() => {
                setOnDutyRoleView((current) => (current === card.role ? null : card.role));
                setRoleFilter(card.role);
                setDayFilter(getCurrentDayToken());
              }}
            >
              <p className={styles.metricLabel}>{card.label}</p>
              <p className={styles.metricValue}>{card.members.length}</p>
              <p className={styles.metricDetail}>Tap to open on-duty list and today vessels</p>
            </button>
          );
        })}
      </section>

      {onDutyRoleView ? (
        <section className={styles.panelCard}>
          <div className={styles.panelHeaderSplit}>
            <div>
              <h2 className={styles.sectionTitle}>{roleLabelFromKey(onDutyRoleView)} On Today</h2>
              <p className={styles.sectionHint}>
                Current on-duty team members and their assigned vessels for today.
              </p>
            </div>
            <button type="button" className={styles.ghostButton} onClick={() => setOnDutyRoleView(null)}>
              Close
            </button>
          </div>

          <div className={styles.stackList}>
            {selectedOnDutyMembers.length > 0 ? (
              selectedOnDutyMembers.map((member) => (
                <article key={`onduty-${member.id}`} className={styles.miniRow}>
                  <div className={styles.teamMemberMain}>
                    <p className={styles.rowMain}>{member.label}</p>
                    <p className={styles.rowMeta}>{member.positionLabel}</p>
                  </div>
                  <div className={styles.teamMemberVessels}>
                    {member.todayVessels.length > 0 ? (
                      member.todayVessels.map((vessel) => (
                        <span key={`${member.id}-${vessel}`} className={styles.roleChip}>
                          {vessel}
                        </span>
                      ))
                    ) : (
                      <span className={styles.rowMeta}>No vessels assigned for today yet.</span>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className={styles.sectionHint}>No on-duty members currently match this role.</p>
            )}
          </div>
        </section>
      ) : null}

      <section className={styles.panelCard}>
        <div className={styles.panelHeaderSplit}>
          <div>
            <h2 className={styles.sectionTitle}>Roster Filters</h2>
            <p className={styles.sectionHint}>
              {filteredCount} of {totalRosterCount} active members shown.
            </p>
          </div>
          {canManage ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setShowAddForm((current) => !current)}
              disabled={adding || isPending}
            >
              {showAddForm ? "Close Add Team Member" : "Add Team Member"}
            </button>
          ) : null}
        </div>

        <div className={styles.filterRow}>
          <label className={styles.searchWrap}>
            <span className={styles.visuallyHidden}>Search name and surname</span>
            <input
              type="search"
              list="team-member-suggestions"
              className={styles.searchInput}
              placeholder="Search by name, surname, role, or position (e.g. KEN)"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <datalist id="team-member-suggestions">
            {searchSuggestions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <datalist id="team-role-group-suggestions">
            {roleGroupSuggestions.map((value) => (
              <option key={`role-group-${value}`} value={value} />
            ))}
          </datalist>

          <label className={styles.selectWrap}>
            <span className={styles.visuallyHidden}>Filter by role</span>
            <select
              className={styles.selectInput}
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as TeamRoleFilter)}
            >
              {roleMeta.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.previousTeamWrap}>
          <button
            type="button"
            className={styles.previousTeamPill}
            onClick={() => setPreviousDropdownOpen((current) => !current)}
            aria-expanded={previousDropdownOpen}
            aria-controls="previous-team-dropdown"
          >
            Previously on Team ({previousMembers.length}) {previousDropdownOpen ? "▴" : "▾"}
          </button>

          {previousDropdownOpen ? (
            <div id="previous-team-dropdown" className={styles.previousTeamDropdown}>
              {previousMembers.length > 0 ? (
                <div className={styles.stackList}>
                  {previousMembers.map((member) => {
                    const editingThis = previousEditing?.original.id === member.id;
                    const busy =
                      actionBusyKey === `restore-${member.id}` ||
                      actionBusyKey === `restore-edit-${member.id}`;

                    return (
                      <article key={`previous-inline-${member.id}`} className={styles.miniRow}>
                        <div className={styles.teamMemberMain}>
                          <p className={styles.rowMain}>{member.label}</p>
                          <p className={styles.rowMeta}>
                            {member.positionLabel} | {member.roleLabel}
                          </p>
                          <p className={styles.rowMeta}>
                            Days off: {member.daysOff.length ? member.daysOff.join("/") : "None"}
                          </p>
                        </div>

                        {canManage ? (
                          <div className={styles.inlineActions}>
                            <button
                              type="button"
                              className={styles.inlineLinkButton}
                              disabled={busy || isPending}
                              onClick={() => startPreviousEdit(member)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={styles.primaryButton}
                              disabled={busy || isPending}
                              onClick={() =>
                                applyAction(
                                  `restore-${member.id}`,
                                  () =>
                                    sendTeamAction({
                                      action: "add",
                                      role: member.roleKey,
                                      label: member.label,
                                      positionLabel: member.positionLabel,
                                      daysOff: member.daysOff,
                                    }),
                                  `${member.label} restored to active roster.`,
                                )
                              }
                            >
                              Add Back
                            </button>
                          </div>
                        ) : null}

                        {editingThis && previousEditing ? (
                          <form className={styles.teamInlineForm} onSubmit={savePreviousEdit}>
                            <label className={styles.overlayField}>
                              <span>First Name</span>
                              <input
                                className={styles.overlayInput}
                                value={previousEditing.draft.firstName}
                                onChange={(event) =>
                                  setPreviousEditing((current) =>
                                    current
                                      ? {
                                          ...current,
                                          draft: { ...current.draft, firstName: event.target.value },
                                        }
                                      : current,
                                  )
                                }
                                required
                              />
                            </label>
                            <label className={styles.overlayField}>
                              <span>Surname</span>
                              <input
                                className={styles.overlayInput}
                                value={previousEditing.draft.surname}
                                onChange={(event) =>
                                  setPreviousEditing((current) =>
                                    current
                                      ? {
                                          ...current,
                                          draft: { ...current.draft, surname: event.target.value },
                                        }
                                      : current,
                                  )
                                }
                                required
                              />
                            </label>
                            <label className={styles.overlayField}>
                              <span>Role Bucket (planning)</span>
                              <select
                                className={styles.overlayInput}
                                value={previousEditing.draft.roleKey}
                                onChange={(event) => {
                                  const nextRole = event.target.value as WorkforceRoleKey;
                                  setPreviousEditing((current) =>
                                    current
                                      ? {
                                          ...current,
                                          draft: {
                                            ...current.draft,
                                            roleKey: nextRole,
                                            positionLabel:
                                              current.draft.positionLabel === defaultPositionForRole(current.draft.roleKey) ||
                                              !current.draft.positionLabel.trim()
                                                ? defaultPositionForRole(nextRole)
                                                : current.draft.positionLabel,
                                          },
                                        }
                                      : current,
                                  );
                                }}
                              >
                                <option value="technicians">Technician</option>
                                <option value="riggers">Rigger</option>
                                <option value="shipwrights">Shipwright</option>
                                <option value="acTechs">AC Tech</option>
                              </select>
                            </label>
                            <label className={styles.overlayField}>
                              <span>Position / Role Group (custom)</span>
                              <input
                                className={styles.overlayInput}
                                list="team-role-group-suggestions"
                                value={previousEditing.draft.positionLabel}
                                onChange={(event) =>
                                  setPreviousEditing((current) =>
                                    current
                                      ? {
                                          ...current,
                                          draft: { ...current.draft, positionLabel: event.target.value },
                                        }
                                      : current,
                                  )
                                }
                                required
                              />
                            </label>
                            <label className={styles.overlayField}>
                              <span>Days Off</span>
                              <DayChecklistDropdown
                                selectedDays={previousEditing.draft.daysOff}
                                onChange={(days) =>
                                  setPreviousEditing((current) =>
                                    current
                                      ? {
                                          ...current,
                                          draft: { ...current.draft, daysOff: days },
                                        }
                                      : current,
                                  )
                                }
                                idPrefix={`previous-edit-days-off-${member.id}`}
                              />
                            </label>
                            <div className={styles.inlineActions}>
                              <button type="submit" className={styles.primaryButton} disabled={busy || isPending}>
                                Add Back
                              </button>
                              <button
                                type="button"
                                className={styles.ghostButton}
                                disabled={busy || isPending}
                                onClick={cancelPreviousEdit}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.sectionHint}>No previous team members for this filter yet.</p>
              )}
            </div>
          ) : null}
        </div>

        <div className={styles.tabGroup} aria-label="Weekday filter">
          <button
            type="button"
            className={dayFilter === "all" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
            onClick={() => setDayFilter("all")}
          >
            All Days
          </button>
          {dayOrder.map((day) => (
            <button
              key={day}
              type="button"
              className={dayFilter === day ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
              onClick={() => setDayFilter(day)}
            >
              {day}
            </button>
          ))}
        </div>

        {showAddForm && canManage ? (
          <form className={styles.teamInlineForm} onSubmit={handleAddMember}>
            <label className={styles.overlayField}>
              <span>First Name</span>
              <input
                className={styles.overlayInput}
                value={addDraft.firstName}
                onChange={(event) =>
                  setAddDraft((current) => ({
                    ...current,
                    firstName: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className={styles.overlayField}>
              <span>Surname</span>
              <input
                className={styles.overlayInput}
                value={addDraft.surname}
                onChange={(event) =>
                  setAddDraft((current) => ({
                    ...current,
                    surname: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className={styles.overlayField}>
              <span>Role Bucket (planning)</span>
              <select
                className={styles.overlayInput}
                value={addDraft.roleKey}
                onChange={(event) => {
                  const nextRole = event.target.value as WorkforceRoleKey;
                  setAddDraft((current) => ({
                    ...current,
                    roleKey: nextRole,
                    positionLabel:
                      current.positionLabel === defaultPositionForRole(current.roleKey) || !current.positionLabel.trim()
                        ? defaultPositionForRole(nextRole)
                        : current.positionLabel,
                  }));
                }}
              >
                <option value="technicians">Technician</option>
                <option value="riggers">Rigger</option>
                <option value="shipwrights">Shipwright</option>
                <option value="acTechs">AC Tech</option>
              </select>
            </label>
            <label className={styles.overlayField}>
              <span>Position / Role Group (custom)</span>
              <input
                className={styles.overlayInput}
                list="team-role-group-suggestions"
                value={addDraft.positionLabel}
                onChange={(event) =>
                  setAddDraft((current) => ({
                    ...current,
                    positionLabel: event.target.value,
                  }))
                }
                placeholder="Type any group, e.g. FG / Electrical / Refit"
                required
              />
            </label>
            <label className={styles.overlayField}>
              <span>Days Off</span>
              <DayChecklistDropdown
                selectedDays={addDraft.daysOff}
                onChange={(days) =>
                  setAddDraft((current) => ({
                    ...current,
                    daysOff: days,
                  }))
                }
                idPrefix="add-member-days-off"
              />
            </label>
            <label className={styles.teamCheckboxField}>
              <input
                type="checkbox"
                checked={addDraft.onLeave}
                onChange={(event) =>
                  setAddDraft((current) => ({
                    ...current,
                    onLeave: event.target.checked,
                  }))
                }
              />
              <span>Mark as on leave now</span>
            </label>
            <div className={styles.inlineActions}>
              <button type="submit" className={styles.primaryButton} disabled={adding || isPending}>
                {adding ? "Saving..." : "Save Team Member"}
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => {
                  setShowAddForm(false);
                  setAddDraft(buildDefaultDraft(addDraft.roleKey));
                }}
                disabled={adding || isPending}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {error ? (
          <p className={styles.overlayError} role="alert">
            {error}
          </p>
        ) : null}
        {feedback ? <p className={styles.teamSuccess}>{feedback}</p> : null}
      </section>

      <section className={styles.panelCard}>
          <div className={styles.panelHeaderSplit}>
            <div>
              <h2 className={styles.sectionTitle}>Current Team Members</h2>
              <p className={styles.sectionHint}>
                Status badge reflects {dayFilter === "all" ? `today (${statusDay})` : dayFilter} availability.
              </p>
            </div>
          </div>

          <div className={styles.stackList}>
            {searchedMembers.length > 0 ? (
              searchedMembers.map((member) => {
                const isAvailable = isMemberAvailableOnDay(member, statusDay);
                const isAllDaysView = dayFilter === "all";
                const editingThis = editing?.original.id === member.id;
                const busy =
                  actionBusyKey === `remove-${member.id}` ||
                  actionBusyKey === `leave-${member.id}` ||
                  actionBusyKey === `edit-${member.id}`;
                const statusText = isAllDaysView
                  ? member.onLeave
                    ? "On Leave"
                    : isAvailable
                      ? `On (${statusDay})`
                      : `Off (${statusDay})`
                  : member.onLeave
                    ? "On Leave"
                    : isAvailable
                      ? `On (${statusDay})`
                      : `Off (${statusDay})`;
                const offDaysText = member.daysOff.length > 0 ? member.daysOff.join("/") : "None";

                return (
                  <article
                    key={member.id}
                    className={isAllDaysView ? `${styles.miniRow} ${styles.teamAllDaysRow}` : styles.miniRow}
                  >
                    <div className={isAllDaysView ? `${styles.teamMemberMain} ${styles.teamMemberMainAllDays}` : styles.teamMemberMain}>
                      <p className={styles.rowMain}>{member.label}</p>
                      <p className={styles.rowMeta}>
                        {member.positionLabel} | {member.roleLabel}
                      </p>
                      {isAllDaysView ? (
                        <span className={styles.teamAllDaysMeta}>Days off: {offDaysText}</span>
                      ) : (
                        <p className={styles.rowMeta}>
                          Days off: {offDaysText}
                        </p>
                      )}
                    </div>

                    <div className={isAllDaysView ? `${styles.teamMemberActions} ${styles.teamMemberActionsAllDays}` : styles.teamMemberActions}>
                      <span
                        className={
                          member.onLeave || !isAvailable
                            ? `${styles.statusBadge} ${styles.availabilityOff}`
                            : `${styles.statusBadge} ${styles.availabilityOn}`
                        }
                      >
                        {statusText}
                      </span>
                      {isAllDaysView ? <span className={styles.metricPill}>{offDaysText}</span> : null}

                      {canManage ? (
                        <div className={styles.inlineActions}>
                          <button
                            type="button"
                            className={styles.inlineLinkButton}
                            onClick={() => startEdit(member)}
                            disabled={busy || isPending}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={styles.ghostButton}
                            onClick={() =>
                              applyAction(
                                `leave-${member.id}`,
                                () =>
                                  sendTeamAction({
                                    action: member.onLeave ? "return" : "leave",
                                    role: member.roleKey,
                                    label: member.label,
                                    positionLabel: member.positionLabel,
                                    daysOff: member.daysOff,
                                  }),
                                member.onLeave ? `${member.label} returned from leave.` : `${member.label} marked on leave.`,
                              )
                            }
                            disabled={busy || isPending}
                          >
                            {member.onLeave ? "Return" : "Leave"}
                          </button>
                          <button
                            type="button"
                            className={styles.dangerButton}
                            onClick={() =>
                              applyAction(
                                `remove-${member.id}`,
                                () =>
                                  sendTeamAction({
                                    action: "remove",
                                    role: member.roleKey,
                                    label: member.label,
                                    positionLabel: member.positionLabel,
                                    daysOff: member.daysOff,
                                  }),
                                `${member.label} moved to Previously on Team.`,
                              )
                            }
                            disabled={busy || isPending}
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {editingThis && editing ? (
                      <form className={styles.teamInlineForm} onSubmit={saveEdit}>
                        <label className={styles.overlayField}>
                          <span>First Name</span>
                          <input
                            className={styles.overlayInput}
                            value={editing.draft.firstName}
                            onChange={(event) =>
                              setEditing((current) =>
                                current
                                  ? {
                                      ...current,
                                      draft: { ...current.draft, firstName: event.target.value },
                                    }
                                  : current,
                              )
                            }
                            required
                          />
                        </label>
                        <label className={styles.overlayField}>
                          <span>Surname</span>
                          <input
                            className={styles.overlayInput}
                            value={editing.draft.surname}
                            onChange={(event) =>
                              setEditing((current) =>
                                current
                                  ? {
                                      ...current,
                                      draft: { ...current.draft, surname: event.target.value },
                                    }
                                  : current,
                              )
                            }
                            required
                          />
                        </label>
                        <label className={styles.overlayField}>
                          <span>Role Bucket (planning)</span>
                          <select
                            className={styles.overlayInput}
                            value={editing.draft.roleKey}
                            onChange={(event) => {
                              const nextRole = event.target.value as WorkforceRoleKey;
                              setEditing((current) =>
                                current
                                  ? {
                                      ...current,
                                      draft: {
                                        ...current.draft,
                                        roleKey: nextRole,
                                        positionLabel:
                                          current.draft.positionLabel === defaultPositionForRole(current.draft.roleKey) ||
                                          !current.draft.positionLabel.trim()
                                            ? defaultPositionForRole(nextRole)
                                            : current.draft.positionLabel,
                                      },
                                    }
                                  : current,
                              );
                            }}
                          >
                            <option value="technicians">Technician</option>
                            <option value="riggers">Rigger</option>
                            <option value="shipwrights">Shipwright</option>
                            <option value="acTechs">AC Tech</option>
                          </select>
                        </label>
                        <label className={styles.overlayField}>
                          <span>Position / Role Group (custom)</span>
                          <input
                            className={styles.overlayInput}
                            list="team-role-group-suggestions"
                            value={editing.draft.positionLabel}
                            onChange={(event) =>
                              setEditing((current) =>
                                current
                                  ? {
                                      ...current,
                                      draft: { ...current.draft, positionLabel: event.target.value },
                                    }
                                  : current,
                              )
                            }
                            required
                          />
                        </label>
                        <label className={styles.overlayField}>
                          <span>Days Off</span>
                          <DayChecklistDropdown
                            selectedDays={editing.draft.daysOff}
                            onChange={(days) =>
                              setEditing((current) =>
                                current
                                  ? {
                                      ...current,
                                      draft: { ...current.draft, daysOff: days },
                                    }
                                  : current,
                              )
                            }
                            idPrefix={`edit-days-off-${member.id}`}
                          />
                        </label>
                        <label className={styles.teamCheckboxField}>
                          <input
                            type="checkbox"
                            checked={editing.draft.onLeave}
                            onChange={(event) =>
                              setEditing((current) =>
                                current
                                  ? {
                                      ...current,
                                      draft: { ...current.draft, onLeave: event.target.checked },
                                    }
                                  : current,
                              )
                            }
                          />
                          <span>On leave</span>
                        </label>
                        <div className={styles.inlineActions}>
                          <button type="submit" className={styles.primaryButton} disabled={busy || isPending}>
                            Save Changes
                          </button>
                          <button
                            type="button"
                            className={styles.ghostButton}
                            onClick={cancelEdit}
                            disabled={busy || isPending}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <p className={styles.sectionHint}>No active team members match the current filters.</p>
            )}
          </div>
      </section>
    </div>
  );
}

function defaultPositionForRole(role: WorkforceRoleKey): string {
  if (role === "technicians") {
    return "Technician";
  }
  if (role === "riggers") {
    return "Rigger";
  }
  if (role === "shipwrights") {
    return "Shipwright";
  }
  return "AC Tech";
}

function buildDefaultDraft(role: WorkforceRoleKey): TeamMemberDraft {
  return {
    firstName: "",
    surname: "",
    roleKey: role,
    positionLabel: defaultPositionForRole(role),
    daysOff: [],
    onLeave: false,
  };
}

function splitName(label: string): { firstName: string; surname: string } {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", surname: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], surname: "" };
  }
  return {
    firstName: parts[0],
    surname: parts.slice(1).join(" "),
  };
}

function joinName(firstName: string, surname: string): string {
  return [firstName.trim(), surname.trim()].filter(Boolean).join(" ").trim();
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getCurrentDayToken(): DayToken {
  const current = new Date();
  const day = current.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3);
  return normalizeDayToken(day) ?? "Mon";
}

function normalizeDayList(days: string[]): DayToken[] {
  return [...new Set(days.map((day) => normalizeDayToken(day)).filter((day): day is DayToken => Boolean(day)))];
}

function isMemberAvailableOnDay(
  member: { daysOff: string[]; onLeave: boolean },
  day: DayToken,
): boolean {
  if (member.onLeave) {
    return false;
  }
  const normalizedOff = normalizeDayList(member.daysOff);
  return !normalizedOff.includes(day);
}

function normalizeDayToken(day: string): DayToken | null {
  const token = day.trim().slice(0, 3).toLowerCase();
  if (token === "mon") {
    return "Mon";
  }
  if (token === "tue") {
    return "Tue";
  }
  if (token === "wed") {
    return "Wed";
  }
  if (token === "thu") {
    return "Thu";
  }
  if (token === "fri") {
    return "Fri";
  }
  if (token === "sat") {
    return "Sat";
  }
  if (token === "sun") {
    return "Sun";
  }
  return null;
}

function DayChecklistDropdown(input: {
  selectedDays: DayToken[];
  onChange: (days: DayToken[]) => void;
  idPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = [...new Set(input.selectedDays)];
  const summary = selected.length > 0 ? selected.join("/") : "Select days";

  function toggleDay(day: DayToken, checked: boolean) {
    if (checked) {
      const next = [...new Set([...selected, day])];
      next.sort((left, right) => dayOrder.indexOf(left) - dayOrder.indexOf(right));
      input.onChange(next);
      return;
    }
    input.onChange(selected.filter((entry) => entry !== day));
  }

  return (
    <div className={styles.daysOffSelectWrap}>
      <button
        type="button"
        className={styles.daysOffSelectButton}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={`${input.idPrefix}-menu`}
      >
        {summary} {open ? "▴" : "▾"}
      </button>
      {open ? (
        <div id={`${input.idPrefix}-menu`} className={styles.daysOffSelectMenu}>
          {dayOrder.map((day) => (
            <label key={`${input.idPrefix}-${day}`} className={styles.daysOffOption}>
              <input
                type="checkbox"
                checked={selected.includes(day)}
                onChange={(event) => toggleDay(day, event.target.checked)}
              />
              <span>{day}</span>
            </label>
          ))}
          <div className={styles.inlineActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => input.onChange([])}
            >
              Clear
            </button>
            <button type="button" className={styles.primaryButton} onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function roleLabelFromKey(role: WorkforceRoleKey): string {
  if (role === "technicians") {
    return "Technicians";
  }
  if (role === "riggers") {
    return "Riggers";
  }
  if (role === "shipwrights") {
    return "Shipwrights";
  }
  return "AC Techs";
}
