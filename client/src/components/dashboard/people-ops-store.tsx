"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { useAuth } from "@/components/auth/auth-provider"
import { useOrganization } from "@/components/dashboard/organization-store"
import {
  addManualCandidate,
  completeAiInterview,
  decideAiScreening,
  deleteHiringCandidate,
  forceExpireApplyForm,
  generateAiInterviewQuestions,
  moveHiringCandidate,
  moveToAiScreening,
  saveHiringJob,
  selectAfterTechnical,
  ensureInterviewLink,
  sendInterviewInvites,
  sendTechnicalInvite,
  setInterviewQuestions,
  approveInterviewQuestions,
  submitApplication,
  updateHiringCandidate,
  updateJobHiring,
} from "@/lib/hiring-actions"
import {
  enableHiringApi,
  useHiringState,
  setHiringCandidates,
  setHiringJobs,
} from "@/lib/hiring-store"
import { peopleOpsApi } from "@/lib/auth-api"
import { canManagePeople, type Employee } from "@/lib/organization"
import {
  addDays,
  leaveAllowance,
  onboardingTemplate,
  seedLeave,
  seedOnboarding,
  toIsoDate,
  todayIso,
  workingDays,
  type Candidate,
  type CandidateStage,
  type Job,
  type LeaveRequest,
  type LeaveType,
  type OnboardingPlan,
  type OnboardingTask,
} from "@/lib/people-ops"
import type { InterviewQuestion } from "@/lib/hiring-pipeline"

type Result = { ok: true; message?: string; id?: string; token?: string } | { ok: false; message: string }

type PeopleOpsValue = {
  loading: boolean
  /** Owner/Admin, or anyone in People Operations. */
  isPeopleTeam: boolean
  /** Owner or Admin — org-wide leave management. */
  isLeaveAdmin: boolean
  jobs: Job[]
  candidates: Candidate[]
  plans: OnboardingPlan[]
  leave: LeaveRequest[]

  saveJob: (input: Omit<Job, "id" | "createdAt"> & { id?: string }) => Result
  updateJobHiring: (jobId: string, hiring: Job["hiring"]) => Result
  approveInterviewQuestions: (jobId: string, questionIds?: string[]) => Result
  setInterviewQuestions: (jobId: string, questions: InterviewQuestion[]) => Result
  generateAiInterviewQuestions: (jobId: string) => Result & { questions?: InterviewQuestion[] }
  forceExpireApplyForm: (jobId: string) => Result
  addCandidate: (input: Pick<Candidate, "jobId" | "name" | "email" | "source" | "notes">) => Result
  submitApplication: typeof submitApplication
  updateCandidate: (id: string, input: Partial<Pick<Candidate, "rating" | "notes">>) => void
  moveCandidate: (id: string, stage: CandidateStage) => Promise<Result> | Result
  deleteCandidate: (id: string) => void
  hiredCount: (jobId: string) => number
  moveToAiScreening: (jobId: string) => Result
  decideAiScreening: (jobId: string) => Result
  sendInterviewInvites: (jobId: string, candidateIds?: string[]) => Result
  ensureInterviewLink: typeof ensureInterviewLink
  completeAiInterview: typeof completeAiInterview
  sendTechnicalInvite: (candidateId: string, mode: "On-site" | "Online", note: string) => Result
  selectAfterTechnical: (candidateId: string, decision: "Offer" | "Rejected") => Result
  hireCandidate: (id: string) => Promise<Result>

  startOnboarding: (employeeId: string, startDate: string, buddyId: string) => Promise<Result> | Result
  toggleTask: (planId: string, taskId: string) => void
  addTask: (planId: string, task: Omit<OnboardingTask, "id" | "done">) => void
  removeTask: (planId: string, taskId: string) => void

  requestLeave: (
    input: Pick<LeaveRequest, "type" | "start" | "end" | "reason">
  ) => Promise<Result> | Result
  decideLeave: (
    id: string,
    decision: "Approved" | "Declined",
    note: string
  ) => Promise<Result> | Result
  cancelLeave: (id: string) => Promise<Result> | Result
  canDecide: (request: LeaveRequest) => boolean
  balance: (employeeId: string, type: LeaveType) => { allowance: number | null; used: number; pending: number }
  approverFor: (employee: Employee) => string
}

const PeopleOpsContext = createContext<PeopleOpsValue | null>(null)

export function PeopleOpsProvider({ children }: { children: ReactNode }) {
  const { me, employees, getEmployee, inviteEmployee } = useOrganization()
  const { isAuthenticated, activeOrgId } = useAuth()
  const { jobs, candidates } = useHiringState()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [loading, setLoading] = useState(useApi)
  const [plans, setPlans] = useState<OnboardingPlan[]>([])
  const [leave, setLeave] = useState<LeaveRequest[]>([])

  useEffect(() => {
    if (!useApi || !activeOrgId) {
      void enableHiringApi(null)
      setPlans(seedOnboarding)
      setLeave(seedLeave)
      setLoading(false)
      return
    }
    setLoading(true)
    void (async () => {
      try {
        const [, leaveRows, planRows] = await Promise.all([
          enableHiringApi(activeOrgId),
          peopleOpsApi.listLeave(activeOrgId),
          peopleOpsApi.listOnboarding(activeOrgId),
        ])
        setLeave(
          leaveRows.map((row) => ({
            id: row.id,
            employeeId: row.employeeId,
            type: row.type as LeaveType,
            start: row.start,
            end: row.end,
            reason: row.reason,
            status: row.status as LeaveRequest["status"],
            approverId: row.approverId,
            decisionNote: row.decisionNote || undefined,
            createdAt: row.createdAt,
          }))
        )
        setPlans(
          planRows.map((row) => ({
            id: row.id,
            employeeId: row.employeeId,
            startDate: toIsoDate(row.startDate) ?? todayIso(),
            buddyId: row.buddyId,
            tasks: (row.tasks || []) as OnboardingPlan["tasks"],
          }))
        )
      } catch {
        setLeave([])
        setPlans([])
      } finally {
        setLoading(false)
      }
    })()
  }, [useApi, activeOrgId])

  const value = useMemo<PeopleOpsValue>(() => {
    const meId = me?.id ?? ""
    const isAdmin = canManagePeople(me?.accessRole)
    const isLeaveAdmin = isAdmin
    const isPeopleTeam = isAdmin || me?.departmentId === "dep-people"
    // Offline/seed: mirror API scoping so employees don't see org-wide leave.
    const scopedLeave =
      isLeaveAdmin || !meId
        ? leave
        : leave.filter((item) => item.employeeId === meId || item.approverId === meId)

    const hiredCount = (jobId: string) =>
      candidates.filter((candidate) => candidate.jobId === jobId && candidate.stage === "Hired").length

    function makePlan(employeeId: string, startDate: string, buddyId: string): OnboardingPlan {
      const id = `onb-${Date.now()}`
      return {
        id,
        employeeId,
        startDate,
        buddyId,
        tasks: onboardingTemplate.map((task, index) => ({ ...task, id: `${id}-${index}`, done: false })),
      }
    }

    function approverFor(employee: Employee) {
      const manager = getEmployee(employee.managerId)
      if (manager && manager.status === "Active" && manager.id !== employee.id) return manager.id
      return (
        employees.find(
          (item) =>
            item.id !== employee.id && item.status === "Active" && canManagePeople(item.accessRole)
        )?.id ?? ""
      )
    }

    function balance(employeeId: string, type: LeaveType) {
      const year = todayIso().slice(0, 4)
      const mine = scopedLeave.filter(
        (item) => item.employeeId === employeeId && item.type === type && item.start.startsWith(year)
      )
      const sum = (status: LeaveRequest["status"]) =>
        mine.filter((item) => item.status === status).reduce((total, item) => total + workingDays(item.start, item.end), 0)
      return { allowance: leaveAllowance[type], used: sum("Approved"), pending: sum("Pending") }
    }

    async function hireCandidateImpl(id: string): Promise<Result> {
        const candidate = candidates.find((item) => item.id === id)
        const job = jobs.find((item) => item.id === candidate?.jobId)
        if (!candidate || !job) return { ok: false, message: "Candidate not found." }
        if (candidate.stage === "Hired") return { ok: false, message: `${candidate.name} is already hired.` }
        if (candidate.stage !== "Offer") {
          return { ok: false, message: "Only candidates at Offer can be marked hired." }
        }
        if (hiredCount(job.id) >= job.openings) {
          return { ok: false, message: `All ${job.openings} openings for ${job.title} are filled.` }
        }
        const invite = await inviteEmployee({
          name: candidate.name,
          email: candidate.email,
          title: job.title,
          departmentId: job.departmentId,
          managerId: job.hiringManagerId,
          accessRole: "Member",
        })
        if (!invite.ok) return invite
        const employeeId = invite.id
        // Existing users get an invited membership id; brand-new emails onboard after they accept.
        if (employeeId) {
          const plan = makePlan(employeeId, addDays(todayIso(), 14), job.hiringManagerId)
          if (useApi && activeOrgId) {
            try {
              const row = await peopleOpsApi.createOnboarding(activeOrgId, {
                employeeId,
                startDate: plan.startDate,
                buddyId: plan.buddyId,
                tasks: plan.tasks,
              })
              setPlans((current) => [
                {
                  id: row.id,
                  employeeId: row.employeeId,
                  startDate: toIsoDate(row.startDate) ?? plan.startDate,
                  buddyId: row.buddyId,
                  tasks: row.tasks as OnboardingPlan["tasks"],
                },
                ...current,
              ])
            } catch {
              /* invite may not have a membership yet — skip plan until they join */
            }
          } else {
            setPlans((current) => [plan, ...current])
          }
        }
        setHiringCandidates((current) =>
          current.map((item) =>
            item.id === id ? { ...item, stage: "Hired", employeeId: employeeId || item.employeeId } : item
          )
        )
        if (hiredCount(job.id) + 1 >= job.openings) {
          setHiringJobs((current) => current.map((item) => (item.id === job.id ? { ...item, status: "Closed" } : item)))
        }
        return {
          ok: true,
          message: invite.message || `${candidate.name} hired — invite emailed to ${candidate.email}.`,
        }
    }

    return {
      loading,
      isPeopleTeam,
      isLeaveAdmin,
      jobs,
      candidates,
      plans,
      leave: scopedLeave,
      hiredCount,
      approverFor,
      balance,
      saveJob: saveHiringJob,
      updateJobHiring,
      approveInterviewQuestions,
      setInterviewQuestions,
      generateAiInterviewQuestions,
      forceExpireApplyForm,
      addCandidate: addManualCandidate,
      submitApplication,
      updateCandidate: updateHiringCandidate,
      deleteCandidate: deleteHiringCandidate,
      moveToAiScreening,
      decideAiScreening,
      sendInterviewInvites,
      ensureInterviewLink,
      completeAiInterview,
      sendTechnicalInvite,
      selectAfterTechnical,
      hireCandidate: hireCandidateImpl,
      async moveCandidate(id, stage) {
        if (stage === "Hired") return hireCandidateImpl(id)
        return moveHiringCandidate(id, stage)
      },

      async startOnboarding(employeeId, startDate, buddyId) {
        if (!startDate) return { ok: false, message: "Choose a start date." }
        if (plans.some((plan) => plan.employeeId === employeeId)) {
          return { ok: false, message: "This person already has an onboarding plan." }
        }
        const plan = makePlan(employeeId, startDate, buddyId)
        if (useApi && activeOrgId) {
          try {
            const row = await peopleOpsApi.createOnboarding(activeOrgId, {
              employeeId,
              startDate,
              buddyId,
              tasks: plan.tasks,
            })
            setPlans((current) => [
              {
                id: row.id,
                employeeId: row.employeeId,
                startDate: toIsoDate(row.startDate) ?? startDate,
                buddyId: row.buddyId,
                tasks: row.tasks as OnboardingPlan["tasks"],
              },
              ...current,
            ])
            return { ok: true }
          } catch (err) {
            return {
              ok: false,
              message: err instanceof Error ? err.message : "Could not create onboarding plan.",
            }
          }
        }
        setPlans((current) => [plan, ...current])
        return { ok: true }
      },

      toggleTask(planId, taskId) {
        setPlans((current) => {
          const next = current.map((plan) =>
            plan.id === planId
              ? {
                  ...plan,
                  tasks: plan.tasks.map((task) =>
                    task.id === taskId ? { ...task, done: !task.done } : task
                  ),
                }
              : plan
          )
          const plan = next.find((item) => item.id === planId)
          if (useApi && plan) {
            void peopleOpsApi.updateOnboarding(planId, { tasks: plan.tasks })
          }
          return next
        })
      },

      addTask(planId, task) {
        if (!task.title.trim()) return
        setPlans((current) => {
          const next = current.map((plan) =>
            plan.id === planId
              ? {
                  ...plan,
                  tasks: [
                    ...plan.tasks,
                    { ...task, title: task.title.trim(), id: `task-${Date.now()}`, done: false },
                  ],
                }
              : plan
          )
          const plan = next.find((item) => item.id === planId)
          if (useApi && plan) void peopleOpsApi.updateOnboarding(planId, { tasks: plan.tasks })
          return next
        })
      },

      removeTask(planId, taskId) {
        setPlans((current) => {
          const next = current.map((plan) =>
            plan.id === planId
              ? { ...plan, tasks: plan.tasks.filter((task) => task.id !== taskId) }
              : plan
          )
          const plan = next.find((item) => item.id === planId)
          if (useApi && plan) void peopleOpsApi.updateOnboarding(planId, { tasks: plan.tasks })
          return next
        })
      },

      async requestLeave(input) {
        if (!me) return { ok: false, message: "Sign in to request leave." }
        if (!input.start || !input.end) return { ok: false, message: "Choose start and end dates." }
        if (input.end < input.start) return { ok: false, message: "End date is before the start date." }
        const days = workingDays(input.start, input.end)
        if (!days) return { ok: false, message: "The selected dates contain no working days." }
        const overlap = leave.find(
          (item) =>
            item.employeeId === me.id &&
            (item.status === "Pending" || item.status === "Approved") &&
            item.start <= input.end &&
            input.start <= item.end
        )
        if (overlap) return { ok: false, message: `Overlaps with ${overlap.id} (${overlap.type}).` }
        const { allowance, used, pending } = balance(me.id, input.type)
        if (allowance !== null && used + pending + days > allowance) {
          return {
            ok: false,
            message: `Only ${Math.max(0, allowance - used - pending)} ${input.type.toLowerCase()} days left this year.`,
          }
        }
        const approverId = approverFor(me)
        if (useApi && activeOrgId) {
          try {
            const row = await peopleOpsApi.createLeave(activeOrgId, {
              employeeId: me.id,
              type: input.type,
              start: input.start,
              end: input.end,
              reason: input.reason.trim(),
              approverId,
            })
            setLeave((current) => [
              {
                id: row.id,
                employeeId: row.employeeId,
                type: row.type as LeaveType,
                start: row.start,
                end: row.end,
                reason: row.reason,
                status: row.status as LeaveRequest["status"],
                approverId: row.approverId,
                createdAt: row.createdAt,
              },
              ...current,
            ])
          } catch (err) {
            return {
              ok: false,
              message: err instanceof Error ? err.message : "Could not submit leave request.",
            }
          }
        } else {
          const next = Math.max(213, ...leave.map((item) => Number(item.id.split("-")[1]) || 0)) + 1
          setLeave((current) => [
            {
              ...input,
              reason: input.reason.trim(),
              id: `LV-${next}`,
              employeeId: me.id,
              status: "Pending",
              approverId,
              createdAt: todayIso(),
            },
            ...current,
          ])
        }
        return {
          ok: true,
          message: `Request sent to ${getEmployee(approverId)?.name ?? "an administrator"} for approval.`,
        }
      },

      canDecide: (request) =>
        request.status === "Pending" &&
        request.employeeId !== meId &&
        (request.approverId === meId || isAdmin),

      async decideLeave(id, decision, note) {
        const request = leave.find((item) => item.id === id)
        if (!request) return { ok: false, message: "Request not found." }
        if (request.employeeId === meId) return { ok: false, message: "You can't decide your own request." }
        if (request.status !== "Pending") return { ok: false, message: "This request was already decided." }
        if (request.approverId !== meId && !isAdmin) return { ok: false, message: "You're not the approver." }
        if (decision === "Declined" && !note.trim()) {
          return { ok: false, message: "Add a reason when declining." }
        }
        if (useApi) {
          try {
            const row = await peopleOpsApi.updateLeave(id, {
              status: decision,
              decisionNote: note.trim(),
            })
            setLeave((current) =>
              current.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      status: row.status as LeaveRequest["status"],
                      decisionNote: row.decisionNote || undefined,
                    }
                  : item
              )
            )
          } catch (err) {
            return {
              ok: false,
              message: err instanceof Error ? err.message : "Could not update leave request.",
            }
          }
        } else {
          setLeave((current) =>
            current.map((item) =>
              item.id === id ? { ...item, status: decision, decisionNote: note.trim() || undefined } : item
            )
          )
        }
        return { ok: true }
      },

      async cancelLeave(id) {
        const request = leave.find((item) => item.id === id)
        if (!request || request.employeeId !== meId) return { ok: false, message: "Request not found." }
        if (request.status === "Approved" && request.start <= todayIso()) {
          return { ok: false, message: "Leave that has started can't be cancelled." }
        }
        if (request.status !== "Pending" && request.status !== "Approved") {
          return { ok: false, message: "Only pending or upcoming requests can be cancelled." }
        }
        if (useApi) {
          try {
            await peopleOpsApi.updateLeave(id, { status: "Cancelled" })
          } catch (err) {
            return {
              ok: false,
              message: err instanceof Error ? err.message : "Could not cancel leave request.",
            }
          }
        }
        setLeave((current) =>
          current.map((item) => (item.id === id ? { ...item, status: "Cancelled" } : item))
        )
        return { ok: true }
      },
    }
  }, [
    me,
    employees,
    getEmployee,
    inviteEmployee,
    jobs,
    candidates,
    plans,
    leave,
    loading,
    useApi,
    activeOrgId,
  ])

  return <PeopleOpsContext.Provider value={value}>{children}</PeopleOpsContext.Provider>
}

export function usePeopleOps() {
  const context = useContext(PeopleOpsContext)
  if (!context) throw new Error("usePeopleOps must be used within PeopleOpsProvider")
  return context
}
