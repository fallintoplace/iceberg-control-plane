import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, Boxes, Check, CircleAlert, Clock3, Compass, Database, LoaderCircle, Play, Rows3, Sparkles, Table2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import {
  getWorkerJob,
  getWorkerStatus,
  getWorkers,
  submitWorkerJob,
  type WorkerJob,
  type WorkerJobSubmission,
} from '@/api'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { WorkerResult } from './worker-result'
import { cn } from '@/lib/utils'

type IcebergOperation = Extract<WorkerJobSubmission, { operation: 'catalog.validate' | 'table.inspect' | 'table.sample' }>['operation']
type WorkerOperation = WorkerJobSubmission['operation']

interface ExampleDefinition {
  operation: IcebergOperation
  category: string
  title: string
  description: string
  goCall: string
  icon: LucideIcon
}

const examples: ExampleDefinition[] = [
  {
    operation: 'catalog.validate',
    category: 'CATALOG',
    title: 'Discover namespaces',
    description: 'Connect to the REST catalog and list its top-level namespaces.',
    goCall: 'catalog.ListNamespaces(ctx, nil)',
    icon: Compass,
  },
  {
    operation: 'table.inspect',
    category: 'METADATA',
    title: 'Inspect this table',
    description: 'Load the Iceberg table and return its schema, partitions, and snapshots.',
    goCall: 'catalog.LoadTable(ctx, identifier)',
    icon: Table2,
  },
  {
    operation: 'table.sample',
    category: 'DATA FILES',
    title: 'Read sample rows',
    description: 'Scan the table’s Parquet data files and decode a small row sample.',
    goCall: 'icebergTable.Scan(table.WithLimit(rowLimit)).ToArrowRecords(ctx)',
    icon: Rows3,
  },
]

function formatEngineName(engine: string): string {
  return engine.split(/[/-]/).filter(Boolean).map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`).join(' ')
}

function formatLanguageName(language: string): string {
  return `${language[0]!.toUpperCase()}${language.slice(1)}`
}

function resultTitle(operation: WorkerOperation | null): string {
  switch (operation) {
    case 'catalog.validate': return 'Catalog namespaces'
    case 'table.inspect': return 'Table metadata'
    case 'table.sample': return 'Sample rows'
    case 'tutorial.append': return 'Your first commit'
    case 'tutorial.reset': return 'Lesson reset'
    default: return 'Worker result'
  }
}

function isLessonOperation(operation: WorkerOperation | null): operation is 'tutorial.append' | 'tutorial.reset' {
  return operation === 'tutorial.append' || operation === 'tutorial.reset'
}

function ExampleCard({
  example,
  isGoWorker,
  disabled,
  isRunning,
  hasSucceeded,
  rowLimit,
  onRowLimitChange,
  onRun,
}: {
  example: ExampleDefinition
  isGoWorker: boolean
  disabled: boolean
  isRunning: boolean
  hasSucceeded: boolean
  rowLimit: number
  onRowLimitChange: (rowLimit: number) => void
  onRun: () => void
}) {
  const Icon = example.icon

  return (
    <Card className={cn(
      'flex min-h-[245px] flex-col gap-4 rounded-lg border-[#e1eae6] p-4 shadow-none transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-[#add6ca] hover:shadow-[0_8px_24px_#19372c0b]',
      hasSucceeded && 'border-[#9bcbbb] bg-[#fbfefd]',
    )}>
      <div className="flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand-dark"><Icon aria-hidden="true" size={17} /></span>
        <Badge variant="outline" size="xs" className="tracking-[.07em]">{example.category}</Badge>
      </div>
      <div className="grid gap-1.5">
        <h3 className="text-sm font-semibold tracking-[-0.02em] text-ink">{example.title}</h3>
        <p className="min-h-[36px] text-[11px] leading-[1.55] text-[#718084]">{example.description}</p>
      </div>
      <div className="mt-auto grid gap-3">
        <div className="grid gap-1">
          <span className="text-[9px] font-bold tracking-[.08em] text-[#8a979a] uppercase">{isGoWorker ? 'Apache Iceberg Go call' : 'Worker operation'}</span>
          <code className="overflow-x-auto rounded-md bg-[#f3f7f5] px-2 py-2 font-mono text-[9px] text-[#536d67]">{isGoWorker ? example.goCall : example.operation}</code>
        </div>
        {example.operation === 'table.sample' && (
          <div className="grid grid-cols-[1fr_76px] items-center gap-3">
            <Label className="text-[9px] tracking-[.07em] text-[#819094]" htmlFor="go-sample-limit">ROW LIMIT</Label>
            <Input
              id="go-sample-limit"
              aria-label="Sample row limit"
              className="h-8 px-2 py-1 text-center font-mono text-[11px]"
              max={100}
              min={1}
              onChange={(event) => onRowLimitChange(Number(event.target.value))}
              type="number"
              value={rowLimit}
            />
          </div>
        )}
        <Button className="w-full justify-between" variant={example.operation === 'table.sample' ? 'default' : 'secondary'} disabled={disabled} onClick={onRun} type="button">
          <span className="inline-flex items-center gap-2">
            {isRunning ? <LoaderCircle aria-hidden="true" className="animate-spin" size={14} /> : hasSucceeded ? <Check aria-hidden="true" size={14} /> : <Play aria-hidden="true" size={13} />}
            {isRunning ? 'Running example…' : hasSucceeded ? 'Run again' : 'Run example'}
          </span>
          {!isRunning && <ArrowRight aria-hidden="true" size={14} />}
        </Button>
      </div>
    </Card>
  )
}

export function WorkerWorkbench({
  catalogId,
  namespace,
  tableName,
  currentSnapshotId,
  snapshotCount,
  onTableUpdated,
}: {
  catalogId: string
  namespace: string[]
  tableName: string
  currentSnapshotId?: number
  snapshotCount: number
  onTableUpdated: () => Promise<unknown>
}) {
  const workers = useQuery({ queryKey: ['workers'], queryFn: getWorkers, staleTime: 30_000 })
  const [workerId, setWorkerId] = useState('')
  const [rowLimit, setRowLimit] = useState(10)
  const [jobId, setJobId] = useState('')
  const [activeOperation, setActiveOperation] = useState<WorkerOperation | null>(null)
  const refreshedLessonJobId = useRef('')
  const activeWorkerId = workerId || workers.data?.[0]?.id || ''
  const workerStatus = useQuery({
    queryKey: ['worker-status', activeWorkerId],
    queryFn: () => getWorkerStatus(activeWorkerId),
    enabled: Boolean(activeWorkerId),
    staleTime: 30_000,
  })
  const job = useQuery({
    queryKey: ['worker-job', activeWorkerId, jobId],
    queryFn: () => getWorkerJob(activeWorkerId, jobId),
    enabled: Boolean(activeWorkerId && jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.job.status
      return status === 'succeeded' || status === 'failed' ? false : 500
    },
    refetchIntervalInBackground: true,
  })
  const submit = useMutation({
    mutationFn: (submission: WorkerJobSubmission) => submitWorkerJob(activeWorkerId, submission),
    onSuccess: (accepted) => setJobId(accepted.jobId),
  })

  const operations = workerStatus.data?.worker.capabilities.operations ?? []
  const ready = workerStatus.data?.worker.health.status === 'ready'
  const currentJob: WorkerJob | undefined = job.data?.job
  const isRunning = currentJob?.status === 'queued' || currentJob?.status === 'running'
  const selectedWorker = workers.data?.find((worker) => worker.id === activeWorkerId)
  const runtime = workerStatus.data?.worker.health.runtime
  const isGoWorker = runtime?.language === 'go'
  const isLocalLessonTable = catalogId === 'local' && namespace.length === 1 && namespace[0] === 'analytics' && tableName === 'events'
  const supportsLesson = operations.includes('tutorial.append') && operations.includes('tutorial.reset')
  const showLesson = isGoWorker && isLocalLessonTable && supportsLesson

  const changeWorker = (nextWorkerId: string) => {
    setWorkerId(nextWorkerId)
    setJobId('')
    setActiveOperation(null)
    submit.reset()
  }

  const sendJob = (operation: WorkerOperation) => {
    setActiveOperation(operation)
    setJobId('')
    submit.reset()
    const submission: WorkerJobSubmission = operation === 'catalog.validate'
      ? { protocolVersion: 1, operation, catalogId }
      : operation === 'table.inspect'
        ? { protocolVersion: 1, operation, catalogId, table: { namespace, name: tableName } }
        : operation === 'table.sample'
          ? { protocolVersion: 1, operation, catalogId, table: { namespace, name: tableName }, options: { rowLimit } }
          : { protocolVersion: 1, operation, catalogId }
    submit.mutate(submission)
  }

  useEffect(() => {
    if (
      !isLessonOperation(activeOperation) ||
      currentJob?.status !== 'succeeded' ||
      refreshedLessonJobId.current === currentJob.jobId
    ) return
    refreshedLessonJobId.current = currentJob.jobId
    void onTableUpdated()
  }, [activeOperation, currentJob, onTableUpdated])

  if (workers.isPending) {
    return <Card as="section" className="mb-4"><p className="text-xs text-muted">Loading Iceberg workers…</p></Card>
  }
  if (workers.isError) {
    return <Card as="section" className="mb-4"><Alert variant="destructive">Could not load Iceberg workers.</Alert></Card>
  }
  if (workers.data.length === 0) {
    return (
      <Card as="section" className="mb-4 grid gap-4 border-dashed bg-[#fbfdfc]">
        <CardHeader className="mb-0">
          <Badge variant="outline" size="sm" className="w-fit"><Database aria-hidden="true" size={13} /> Iceberg worker lab</Badge>
          <CardTitle>Try this table with a worker</CardTitle>
        </CardHeader>
        <p className="text-xs leading-relaxed text-muted">Add a worker to run catalog discovery, metadata inspection, and data file reads on this table.</p>
        <Link className={buttonVariants({ variant: 'secondary', size: 'sm' })} to="/workers">Configure a worker</Link>
      </Card>
    )
  }

  const engineName = runtime ? formatEngineName(runtime.engine) : 'Iceberg worker'
  const resultStatus = currentJob?.status

  return (
    <Card as="section" aria-label={`${selectedWorker?.name ?? 'Iceberg worker'} examples`} className="mb-4 overflow-hidden border-[#dbe8e3] p-0 shadow-[0_3px_18px_#19372c07]">
      <CardHeader className="mb-0 flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4 max-[640px]:px-4">
        <div className="grid gap-1.5">
          <Badge variant="outline" size="xs" className="w-fit gap-1.5 tracking-[.06em]"><Boxes aria-hidden="true" size={12} /> LIVE WORKER EXAMPLES</Badge>
          <CardTitle>{isGoWorker ? 'Iceberg Go workbench' : 'Iceberg worker workbench'}</CardTitle>
          <p className="text-[11px] text-[#7b898d]">Run real catalog, metadata, and Parquet reads for <code className="font-mono text-[#415c55]">{namespace.join('.')}.{tableName}</code></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={ready ? 'success' : workerStatus.isError ? 'destructive' : 'secondary'}>
            {ready ? <Check aria-hidden="true" size={12} /> : workerStatus.isError ? <CircleAlert aria-hidden="true" size={12} /> : <Clock3 aria-hidden="true" size={12} />}
            {workerStatus.isPending ? 'Checking' : workerStatus.isError ? 'Offline' : workerStatus.data?.worker.health.status ?? 'Unknown'}
          </Badge>
          {workers.data.length > 1 ? (
            <NativeSelect
              id="iceberg-worker-select"
              aria-label="Select worker"
              className="min-w-[150px]"
              options={workers.data.map((worker) => ({ value: worker.id, label: worker.name }))}
              size="sm"
              value={activeWorkerId}
              onChange={(event) => changeWorker(event.target.value)}
            />
          ) : <span className="text-[10px] text-[#6f7f83]">{selectedWorker?.name ?? engineName}</span>}
        </div>
      </CardHeader>

      <div className="grid gap-4 p-5 max-[640px]:p-4">
        {workerStatus.isError && <Alert variant="destructive">The worker is offline. Start it and check its configured URL before running examples.</Alert>}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold tracking-[.08em] text-brand uppercase">Powered by {engineName}</p>
            <p className="mt-1 text-[11px] text-[#78878b]">{isGoWorker ? 'Each card shows the Go call behind the live worker operation.' : 'Each card shows the operation sent to this worker.'}</p>
          </div>
          {runtime && <span className="font-mono text-[10px] text-[#8a979a]">Iceberg {runtime.engineVersion} · Worker {runtime.version}</span>}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {examples.map((example) => {
            const operationIsActive = activeOperation === example.operation
            const operationIsRunning = operationIsActive && Boolean(isRunning || submit.isPending)
            const operationHasSucceeded = operationIsActive && currentJob?.status === 'succeeded'
            const validRowLimit = Number.isInteger(rowLimit) && rowLimit >= 1 && rowLimit <= 100
            const canRun = ready && operations.includes(example.operation) && !isRunning && !submit.isPending
            return (
              <ExampleCard
                key={example.operation}
                example={example}
                isGoWorker={isGoWorker}
                disabled={!canRun || (example.operation === 'table.sample' && !validRowLimit)}
                isRunning={operationIsRunning}
                hasSucceeded={operationHasSucceeded}
                rowLimit={rowLimit}
                onRowLimitChange={setRowLimit}
                onRun={() => sendJob(example.operation)}
              />
            )
          })}
        </div>

        {showLesson && (
          <Card as="section" aria-label="Iceberg commit lesson" className="grid gap-4 border-[#cde3d8] bg-[linear-gradient(135deg,#f5fbf8_0%,#ffffff_75%)] p-5 shadow-none max-[640px]:p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-2">
                <Badge variant="success" size="xs" className="w-fit gap-1.5 tracking-[.07em]"><Sparkles aria-hidden="true" size={12} /> ICEBERG 101 · COMMITS</Badge>
                <div className="grid gap-1">
                  <h3 className="text-base font-semibold tracking-[-0.02em] text-ink">Make your first commit</h3>
                  <p className="max-w-[650px] text-xs leading-relaxed text-muted">An Iceberg append writes a data file, then commits new metadata that points to a new snapshot. The previous snapshot stays available.</p>
                </div>
              </div>
              <Badge variant="outline" size="sm"><Database aria-hidden="true" size={12} /> Local fixture only</Badge>
            </div>

            <div className="grid gap-3 rounded-lg border border-[#e2eee8] bg-white p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="grid gap-1">
                <span className="text-[9px] font-bold tracking-[.08em] text-[#879597] uppercase">Before</span>
                <code className="font-mono text-[10px] text-[#536d67]">{snapshotCount} snapshots · {currentSnapshotId ?? 'no current snapshot'}</code>
              </div>
              <ArrowDown aria-hidden="true" className="mx-auto rotate-[-90deg] text-brand sm:rotate-0" size={16} />
              <div className="grid gap-1">
                <span className="text-[9px] font-bold tracking-[.08em] text-[#879597] uppercase">After append</span>
                <code className="font-mono text-[10px] text-[#536d67]">new metadata · new snapshot</code>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="grid gap-1.5">
                <span className="text-[9px] font-bold tracking-[.08em] text-[#879597] uppercase">Apache Iceberg Go</span>
                <code className="overflow-x-auto rounded-md bg-[#1d302f] px-3 py-2.5 font-mono text-[10px] text-[#dce9e4]">updated, err := icebergTable.AppendTable(ctx, records, 128, nil)</code>
                <p className="text-[10px] leading-relaxed text-[#7b898d]">This lesson writes only to the local <code className="font-mono">analytics.events</code> fixture. Reset replaces that fixture table with its three starter events.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={!ready || isRunning || submit.isPending} onClick={() => sendJob('tutorial.append')} type="button">
                  {activeOperation === 'tutorial.append' && (isRunning || submit.isPending)
                    ? <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
                    : <Play aria-hidden="true" size={13} />}
                  Append one event
                </Button>
                <Button variant="outline" disabled={!ready || isRunning || submit.isPending} onClick={() => sendJob('tutorial.reset')} type="button">Reset lesson</Button>
              </div>
            </div>
          </Card>
        )}

        {submit.isError && <Alert variant="destructive">{submit.error.message}</Alert>}
        {job.isError && <Alert variant="destructive">{job.error.message}</Alert>}

        {currentJob && (
          <Card as="section" aria-live="polite" className="overflow-hidden border-[#dfe9e5] bg-[#fcfefd] p-0 shadow-none">
            <CardHeader className="mb-0 flex flex-wrap items-center justify-between gap-3 border-b border-[#eaf0ed] px-4 py-3">
              <div className="grid gap-1">
                <p className="text-[9px] font-bold tracking-[.09em] text-brand uppercase">{isGoWorker ? 'Apache Iceberg Go result' : 'Worker result'}</p>
                <CardTitle className="text-sm">{resultTitle(activeOperation)}</CardTitle>
                <code className="font-mono text-[9px] text-[#8a979a]">Job {currentJob.jobId}</code>
              </div>
              <Badge variant={resultStatus === 'succeeded' ? 'success' : resultStatus === 'failed' ? 'destructive' : 'secondary'}>
                {resultStatus === 'running' || resultStatus === 'queued' ? <LoaderCircle aria-hidden="true" className="animate-spin" size={12} /> : null}
                {resultStatus}{currentJob.progress !== undefined ? ` · ${Math.round(currentJob.progress * 100)}%` : ''}
              </Badge>
            </CardHeader>
            <div className="grid gap-4 p-4">
              {currentJob.status === 'failed' && currentJob.error && <Alert variant="destructive">{currentJob.error.message}</Alert>}
              {(currentJob.status === 'queued' || currentJob.status === 'running') && (
                <div className="flex items-center gap-2 text-xs text-muted" role="status">
                  <LoaderCircle aria-hidden="true" className="animate-spin text-brand" size={15} />
                  Waiting for the worker to finish the Iceberg operation…
                </div>
              )}
              {currentJob.status === 'succeeded' && currentJob.result && <WorkerResult result={currentJob.result} implementation={runtime ? formatLanguageName(runtime.language) : undefined} />}
            </div>
          </Card>
        )}
      </div>
    </Card>
  )
}
