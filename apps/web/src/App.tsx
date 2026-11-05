import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  createCatalog,
  deleteCatalog,
  getCatalogStatus,
  getCatalogs,
  getNamespaces,
  getTable,
  getTables,
  getWorkerJob,
  getWorkerStatus,
  getWorkers,
  submitWorkerJob,
  type NamespaceIdentifier,
  type TableIdentifier,
  type TableSummary,
  type WorkerJob,
  type WorkerJobSubmission,
} from './api'

const ui = {
  appShell: 'min-h-screen',
  topbar: 'flex h-16 items-center justify-between border-b border-line bg-white px-[30px] max-[640px]:h-[58px] max-[640px]:px-[15px]',
  brand: 'inline-flex items-center gap-[11px] text-[14px] tracking-[-0.02em] no-underline max-[640px]:text-xs',
  brandMark: 'grid size-[26px] rotate-45 place-items-center rounded-lg bg-brand',
  brandMarkInner: 'size-[9px] rounded-[2px] border-[1.5px] border-[#d9fff4]',
  topbarRight: 'flex items-center gap-[18px] max-[640px]:gap-[10px]',
  topbarCaption: 'text-xs text-muted max-[640px]:hidden',
  readOnlyBadge: 'inline-flex items-center gap-[7px] rounded-full border border-[#d9e9e4] bg-[#f5fbf8] px-[10px] py-1.5 text-[11px] font-bold text-brand-dark max-[640px]:px-[7px] max-[640px]:py-[5px] max-[640px]:text-[10px]',
  statusDot: 'size-1.5 rounded-full bg-[#24a786]',
  topbarLink: 'text-[11px] font-bold text-brand-dark no-underline hover:underline',
  workspace: 'grid min-h-[calc(100vh-64px)] grid-cols-[260px_minmax(0,1fr)] max-[900px]:grid-cols-[220px_minmax(0,1fr)] max-[640px]:block',
  sidebar: 'flex flex-col border-r border-line bg-[#fbfcfc] px-4 pb-[18px] pt-[25px] max-[640px]:border-r-0 max-[640px]:border-b max-[640px]:px-[15px] max-[640px]:pb-[10px] max-[640px]:pt-[14px]',
  sidebarSection: 'border-b border-line px-1 pb-[21px] max-[640px]:pb-3',
  sidebarSectionCompact: 'border-b-0 border-line px-1 pb-[21px] pt-[19px] max-[640px]:pb-3 max-[640px]:pt-3',
  fieldLabel: 'block text-[10px] leading-[1.3] font-bold tracking-[.09em] text-[#7a898d] uppercase',
  catalogSelect: 'mt-[9px] w-full rounded-[7px] border border-[#dce5e2] bg-white py-[10px] pr-8 pl-[11px] text-[13px] text-ink outline-none focus:border-[#8ac7b6] focus:ring-[3px] focus:ring-[#e5f4ef]',
  connectionState: 'mt-[11px] flex items-center gap-[7px] text-[11px] text-[#6a797d]',
  sidebarError: 'mt-2 text-[11px] leading-[1.5] text-danger',
  sectionTitleRow: 'flex items-center justify-between gap-3',
  countPill: 'inline-flex h-[21px] min-w-[23px] items-center justify-center rounded-full bg-[#eef3f2] px-[7px] font-mono text-[11px] text-[#607176]',
  namespaceLink: 'mt-[7px] flex w-full items-center gap-[9px] rounded-md bg-transparent px-[9px] py-2 text-left text-xs text-[#536469] hover:bg-[#eff5f3] hover:text-ink max-[640px]:w-auto',
  namespaceLinkActive: 'bg-brand-soft font-bold text-brand-dark hover:bg-brand-soft hover:text-brand-dark',
  parentLink: 'text-[#7a898d]',
  namespaceGlyph: 'w-[15px] text-center text-[14px] text-[#6e8a83]',
  namespaceList: 'mt-[6px] max-[640px]:flex max-[640px]:flex-wrap max-[640px]:gap-[3px]',
  compact: 'my-[7px] mx-2 text-[11px]',
  loadMore: 'mt-2 ml-2 border-0 bg-transparent px-0 py-[5px] text-[11px] font-bold text-brand-dark disabled:cursor-wait disabled:opacity-60',
  sidebarFootnote: 'mt-auto mx-1 border-t border-line pt-[18px] text-[10px] leading-[1.5] text-[#869397] max-[640px]:hidden',
  mainContent: 'mx-auto w-full max-w-[1440px] px-[38px] pt-[31px] pb-[22px] max-[900px]:px-[22px] max-[900px]:pt-[25px] max-[640px]:px-[14px] max-[640px]:pt-[22px]',
  pageHeading: 'mb-6 flex items-end justify-between gap-[18px] max-[640px]:items-start',
  eyebrow: 'mb-1.5 text-[10px] font-bold tracking-[.11em] text-brand uppercase',
  h1: 'm-0 text-[25px] leading-[1.25] font-semibold tracking-[-0.04em] text-ink max-[640px]:text-[22px]',
  h2: 'm-0 text-base leading-[1.4] font-semibold tracking-[-0.02em] text-ink',
  breadcrumbs: 'mt-[7px] flex flex-wrap items-center gap-[5px] text-[11px] text-[#8a979a]',
  breadcrumbButton: 'border-0 bg-transparent p-0 text-inherit hover:text-brand-dark',
  breadcrumbSeparator: 'mr-[5px] text-[#b7c1c0]',
  headingMeta: 'flex flex-col items-end gap-[5px] pb-0.5 max-[640px]:hidden',
  metaLabel: 'text-[10px] tracking-[.07em] text-[#8a979a] uppercase',
  metaValue: 'font-mono text-[11px] text-[#526368]',
  card: 'mb-4 rounded-[9px] border border-line bg-white p-[21px_22px] shadow-[0_2px_8px_#19372c05] max-[640px]:px-[14px] max-[640px]:py-4',
  contentTitle: 'mb-[18px]',
  namespaceGrid: 'grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-[9px] max-[640px]:grid-cols-1',
  namespaceCard: 'flex min-h-[57px] items-center gap-[10px] rounded-[7px] border border-[#e4ebe9] bg-white px-3 py-[11px] text-left text-[#33474b] transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px hover:border-[#add6ca] hover:bg-[#fbfefd]',
  namespaceCardIcon: 'grid size-7 place-items-center rounded-md bg-[#edf7f3] text-[14px] text-brand',
  namespaceCardName: 'flex-1 overflow-hidden text-xs font-semibold text-ellipsis whitespace-nowrap',
  namespaceCardArrow: 'text-xs text-[#9aabaa]',
  secondaryButton: 'mt-[15px] rounded-md border border-[#d7e7e2] bg-[#f8fcfa] px-[11px] py-2 text-[11px] font-bold text-brand-dark hover:bg-brand-soft disabled:cursor-wait disabled:opacity-60',
  childNamespaceList: 'border-b border-[#edf1f0] pb-[14px]',
  tableListHeading: 'mt-[17px] mb-[6px]',
  tableList: 'border-t border-[#edf1f0]',
  tableRow: 'flex w-full items-center gap-[11px] border-0 border-b border-[#edf1f0] bg-transparent px-[5px] py-3 text-left hover:bg-[#fbfdfc]',
  tableIcon: 'text-[15px] text-[#81918f]',
  tableName: 'font-mono text-xs text-[#293d41]',
  tableRowHint: 'ml-auto text-[10px] text-[#96a2a3] group-hover:text-brand',
  muted: 'text-xs leading-[1.6] text-muted',
  error: 'rounded-md border border-[#f0d8d4] bg-[#fff8f7] px-[13px] py-[11px] text-xs leading-[1.5] text-[#a8463e]',
  detailsStack: 'grid gap-[14px]',
  detailStats: 'grid grid-cols-4 gap-[9px] max-[900px]:grid-cols-2 max-[640px]:grid-cols-2',
  statCard: 'flex min-h-[75px] flex-col justify-between rounded-lg border border-line bg-white p-[13px_14px] max-[640px]:min-h-[68px] max-[640px]:p-[11px]',
  statLabel: 'text-[10px] text-[#819094]',
  statValue: 'text-base font-semibold tracking-[-0.02em] text-[#294047] max-[640px]:text-sm',
  statId: 'overflow-hidden font-mono text-[11px] text-ellipsis whitespace-nowrap',
  statDate: 'text-[11px]',
  backButton: 'rounded-md border border-[#e0e8e6] bg-white px-[9px] py-1.5 text-[10px] text-[#607176] hover:border-[#b9d9d0] hover:text-brand-dark',
  schemaWrap: 'overflow-x-auto',
  schemaTable: 'w-full border-collapse text-[11px]',
  schemaTh: 'px-[11px] pb-[9px] text-left text-[9px] font-bold tracking-[.08em] text-[#8a979a] uppercase',
  schemaTd: 'border-t border-[#edf1f0] px-[11px] py-[10px] text-[#44565a]',
  fieldName: 'font-mono text-[#253c40]',
  schemaCode: 'rounded bg-[#f2f6f4] px-[5px] py-[3px] text-[10px] text-[#536d67]',
  fieldId: 'mr-[5px] inline-block min-w-[35px] font-mono text-[9px] text-[#9aa6a6]',
  partitionBlock: 'mt-[18px] border-t border-[#edf1f0] pt-[14px]',
  tagList: 'flex flex-wrap gap-[6px]',
  tag: 'rounded-[5px] border border-[#e1eae6] bg-[#fafcfb] px-2 py-[6px] font-mono text-[10px] text-[#45605a]',
  tagCode: 'ml-[3px] text-[9px] text-brand',
  snapshotList: 'border-t border-[#edf1f0]',
  snapshotRow: 'flex items-center gap-[11px] border-b border-[#edf1f0] px-[2px] py-[10px]',
  operationIcon: 'grid size-[25px] place-items-center rounded-md bg-[#eef6f3] text-[14px] text-[#638b80]',
  snapshotMain: 'flex flex-1 flex-col gap-[3px]',
  snapshotOperation: 'text-[11px] font-semibold text-[#3d5357] capitalize',
  snapshotDate: 'text-[10px] text-[#889598]',
  snapshotId: 'font-mono text-[10px] text-[#738184]',
  pageFooter: 'px-[2px] pt-[5px] text-[10px] text-[#95a1a2]',
  emptyState: 'mx-auto mt-[12vh] w-[calc(100%_-_32px)] max-w-[560px] rounded-[10px] border border-line bg-white p-[35px] text-center shadow-[0_8px_32px_#19372c08] max-[640px]:mt-[9vh] max-[640px]:px-[18px] max-[640px]:py-6',
  emptyIcon: 'mx-auto mb-[18px] grid size-[52px] place-items-center rounded-[14px] bg-brand-soft text-[27px] text-brand',
  emptyParagraph: 'text-xs leading-[1.6] text-[#758387]',
  codeBlock: 'my-[18px] overflow-x-auto rounded-md border border-[#e5eeea] bg-[#f7faf8] p-3 text-left font-mono text-[10px] text-[#47635b]',
  emptyLink: 'text-[11px] font-semibold text-brand-dark',
  settingsPage: 'min-h-screen',
  settingsContent: 'mx-auto w-[calc(100%_-_36px)] max-w-[900px] pt-[34px] pb-12 max-[640px]:w-[calc(100%_-_28px)] max-[640px]:pt-[23px]',
  settingsHeading: 'mb-6 flex items-center justify-between gap-[18px] max-[640px]:items-start max-[640px]:flex-col',
  catalogForm: 'grid grid-cols-2 gap-x-[14px] gap-y-[17px] max-[640px]:grid-cols-1',
  formLabel: 'grid content-start gap-[7px]',
  formInput: 'w-full min-w-0 rounded-md border border-[#dce5e2] bg-white px-[11px] py-[10px] text-xs text-ink outline-none focus:border-[#8ac7b6] focus:ring-[3px] focus:ring-[#e5f4ef] invalid:not-placeholder-shown:border-[#d88e84]',
  formHint: 'text-[10px] leading-[1.5] text-[#819094]',
  formWide: 'col-span-2 max-[640px]:col-span-1',
  optionalLabel: 'ml-[5px] text-[9px] font-medium tracking-normal text-[#a0abad] normal-case',
  formActions: 'col-span-2 flex items-center gap-3 max-[640px]:col-span-1',
  primaryButton: 'inline-flex min-h-9 items-center justify-center rounded-md border border-brand-dark bg-brand-dark px-[13px] py-[9px] text-[11px] font-bold text-white hover:bg-[#064e43] disabled:cursor-wait disabled:opacity-[.65]',
  success: 'text-[11px] text-brand-dark',
  configuredList: 'border-t border-[#edf1f0]',
  configuredRow: 'flex items-center gap-[11px] border-b border-[#edf1f0] px-[2px] py-[11px]',
  catalogInitial: 'grid size-[31px] flex-none place-items-center rounded-lg bg-brand-soft text-xs font-bold text-brand-dark',
  configuredName: 'flex flex-1 flex-col gap-[3px] text-xs text-[#33474b]',
  configuredCode: 'font-mono text-[10px] text-[#8a979a]',
  removeButton: 'rounded-[5px] border border-[#efdfdd] bg-white px-[9px] py-[6px] text-[10px] text-[#a34a41] hover:bg-[#fff7f6] disabled:cursor-wait disabled:opacity-60',
  settingsFootnote: 'text-[10px] leading-[1.6] text-[#899598]',
  contractLink: 'text-[11px] font-semibold text-brand-dark hover:underline',
  workerGrid: 'grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3',
  workerCard: 'mb-0',
  workerCardHeading: 'flex items-center gap-[10px]',
  workerState: 'ml-auto inline-flex items-center gap-[6px] text-[10px] text-[#7c898d] capitalize',
  workerStateDot: 'size-1.5 rounded-full bg-[#aab4b4]',
  workerRuntime: 'mt-[17px] flex flex-col gap-[5px] text-[10px] text-[#738184]',
  workerLanguage: 'text-xs font-bold text-ink capitalize',
  workerError: 'mt-[15px] text-[11px] text-danger',
  workerEmptyState: 'mt-7',
  workerJobCard: 'mb-4 grid gap-[14px] rounded-[9px] border border-line bg-white p-[21px_22px] shadow-[0_2px_8px_#19372c05] max-[640px]:px-[14px] max-[640px]:py-4',
  workerJobHeading: 'flex items-center justify-between gap-3 max-[640px]:items-start max-[640px]:flex-col',
  workerSelectLabel: 'grid min-w-[180px] gap-[5px] max-[640px]:w-full',
  workerSelect: 'min-w-0 rounded-md border border-[#dce5e2] bg-white px-[9px] py-[7px] text-[11px] text-ink',
  workerJobRuntime: 'flex items-center gap-[10px] text-[10px] text-[#819094]',
  workerJobActions: 'flex flex-wrap items-end gap-2 max-[640px]:items-stretch',
  workerActionButton: 'mt-0 min-h-[34px] px-[11px] py-2 max-[640px]:flex-1',
  workerRowLimit: 'grid w-[74px] gap-1',
  workerRowInput: 'h-[34px] min-w-0 rounded-md border border-[#dce5e2] bg-white px-[9px] py-[7px] text-[11px] text-ink',
  workerConfigLink: 'w-fit no-underline',
  workerJobOutput: 'grid gap-3 border-t border-[#edf1f0] pt-[14px]',
  workerJobOutputHeading: 'flex items-center justify-between gap-[10px]',
  workerJobId: 'font-mono text-[10px] text-[#78878b]',
  workerJobStatus: 'rounded-full bg-[#eff3f2] px-2 py-[5px] text-[10px] font-bold text-[#718085] capitalize',
  workerResult: 'grid gap-3',
  workerResultStats: 'flex flex-wrap gap-2',
  workerResultStat: 'flex min-w-[90px] flex-col gap-1 rounded-md border border-[#e5eeea] bg-[#fafcfb] px-[11px] py-[9px]',
  workerResultStatLabel: 'text-[9px] text-[#859195]',
  workerResultStatValue: 'text-[13px] font-semibold text-[#34504a]',
  workerResultTableWrap: 'overflow-x-auto rounded-md border border-[#edf1f0]',
  workerResultTable: 'w-full border-collapse text-[11px]',
  workerResultTh: 'bg-[#fafcfb] px-[10px] py-2 text-left text-[9px] font-bold tracking-[.06em] text-[#839094] uppercase',
  workerResultTd: 'max-w-[320px] overflow-hidden border-t border-[#edf1f0] px-[10px] py-[9px] text-ellipsis whitespace-nowrap text-[#405458]',
  workerResultCode: 'font-mono text-[10px] text-[#536d67]',
  workerRawResult: 'text-[10px] text-[#6f7f83]',
  workerRawSummary: 'w-fit cursor-pointer',
  workerRawPre: 'mt-2 max-h-[300px] overflow-auto rounded-md bg-[#1d302f] p-3 font-mono text-[10px] leading-[1.6] text-[#dce9e4]',
}

function namespaceKey(namespace: string[]): string {
  return namespace.join('\u001f')
}

function formatDate(timestampMs: number | undefined): string {
  if (timestampMs === undefined) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestampMs)
}

function Loading({ label }: { label: string }) {
  return <p className={ui.muted} role="status">Loading {label}…</p>
}

function ErrorMessage({ message }: { message: string }) {
  return <p className={ui.error} role="alert">{message}</p>
}

function EmptyCatalogs() {
  return (
    <main className={ui.emptyState}>
      <div className={ui.emptyIcon} aria-hidden="true">◇</div>
      <p className={ui.eyebrow}>No catalogs configured</p>
      <h1 className={`${ui.h1} mb-[11px] text-[22px]`}>Connect a REST catalog to get started</h1>
      <p className={ui.emptyParagraph}>Connect a REST catalog to browse its namespaces, tables, and table metadata.</p>
      <Link className={`${ui.primaryButton} mx-auto mt-3 mb-[15px] text-xs no-underline`} to="/settings">Add a catalog</Link>
      <a className={ui.emptyLink} href="https://iceberg.apache.org/rest-catalog-spec/" target="_blank" rel="noreferrer">Read the Iceberg REST Catalog spec ↗</a>
    </main>
  )
}

interface CatalogForm {
  id: string
  name: string
  uri: string
  warehouse: string
  bearerTokenEnv: string
}

const emptyCatalogForm: CatalogForm = {
  id: '',
  name: '',
  uri: '',
  warehouse: '',
  bearerTokenEnv: '',
}

function CatalogSettings() {
  const queryClient = useQueryClient()
  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs })
  const [form, setForm] = useState(emptyCatalogForm)
  const [saved, setSaved] = useState(false)
  const addCatalog = useMutation({
    mutationFn: createCatalog,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['catalogs'] })
      setForm(emptyCatalogForm)
      setSaved(true)
    },
  })
  const removeCatalog = useMutation({
    mutationFn: deleteCatalog,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalogs'] }),
  })

  const updateField = (field: keyof CatalogForm, value: string) => {
    setSaved(false)
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaved(false)
    const input = {
      id: form.id,
      name: form.name,
      uri: form.uri,
      ...(form.warehouse.trim() ? { warehouse: form.warehouse.trim() } : {}),
      ...(form.bearerTokenEnv.trim() ? { bearerTokenEnv: form.bearerTokenEnv.trim() } : {}),
    }
    addCatalog.mutate(input)
  }

  return (
    <div className={ui.settingsPage}>
      <header className={ui.topbar}>
        <Link className={ui.brand} to="/" aria-label="Iceberg Control Plane home">
          <span className={ui.brandMark} aria-hidden="true"><span className={ui.brandMarkInner} /></span>
          <span>Iceberg <strong>Control Plane</strong></span>
        </Link>
        <Link className={ui.backButton} to="/">Back to explorer</Link>
      </header>
      <main className={ui.settingsContent}>
        <div className={ui.settingsHeading}>
          <div><p className={ui.eyebrow}>Configuration</p><h1 className={ui.h1}>Catalog connections</h1></div>
          <span className={ui.readOnlyBadge}><span className={ui.statusDot} />Catalog data stays read only</span>
        </div>

        <section className={ui.card}>
          <div className={ui.contentTitle}><p className={ui.eyebrow}>New connection</p><h2 className={ui.h2}>Add an Iceberg REST catalog</h2></div>
          <form className={ui.catalogForm} onSubmit={handleSubmit}>
            <label className={ui.formLabel}>
              <span className={ui.fieldLabel}>Catalog ID</span>
              <input className={ui.formInput} autoComplete="off" maxLength={64} onChange={(event) => updateField('id', event.target.value)} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" required value={form.id} />
              <small className={ui.formHint}>Use letters, numbers, hyphens, or underscores.</small>
            </label>
            <label className={ui.formLabel}>
              <span className={ui.fieldLabel}>Display name</span>
              <input className={ui.formInput} maxLength={100} onChange={(event) => updateField('name', event.target.value)} required value={form.name} />
            </label>
            <label className={`${ui.formLabel} ${ui.formWide}`}>
              <span className={ui.fieldLabel}>REST catalog URL</span>
              <input className={ui.formInput} autoComplete="url" onChange={(event) => updateField('uri', event.target.value)} placeholder="https://catalog.example.com" required type="url" value={form.uri} />
            </label>
            <label className={ui.formLabel}>
              <span className={ui.fieldLabel}>Warehouse <span className={ui.optionalLabel}>Optional</span></span>
              <input className={ui.formInput} autoComplete="off" onChange={(event) => updateField('warehouse', event.target.value)} value={form.warehouse} />
            </label>
            <label className={ui.formLabel}>
              <span className={ui.fieldLabel}>Bearer token environment variable <span className={ui.optionalLabel}>Optional</span></span>
              <input className={ui.formInput} autoComplete="off" onChange={(event) => updateField('bearerTokenEnv', event.target.value)} placeholder="ICEBERG_PRODUCTION_TOKEN" value={form.bearerTokenEnv} />
              <small className={ui.formHint}>Add the token to the API environment and restart it before saving. The token itself is never sent to this form.</small>
            </label>
            <div className={ui.formActions}>
              <button className={ui.primaryButton} disabled={addCatalog.isPending} type="submit">
                {addCatalog.isPending ? 'Saving…' : 'Save catalog'}
              </button>
              {saved && <span className="text-[11px] text-brand-dark" role="status">Catalog saved.</span>}
            </div>
            {addCatalog.isError && <ErrorMessage message={addCatalog.error.message} />}
          </form>
        </section>

        <section className={ui.card}>
          <div className={`${ui.sectionTitleRow} ${ui.contentTitle}`}>
            <div><p className={ui.eyebrow}>Saved locally</p><h2 className={ui.h2}>Configured catalogs</h2></div>
            <span className={ui.countPill}>{catalogs.data?.length ?? 0}</span>
          </div>
          {catalogs.isPending && <Loading label="catalogs" />}
          {catalogs.isError && <ErrorMessage message="Could not load configured catalogs." />}
          {catalogs.data?.length === 0 && <p className={ui.muted}>No catalogs are configured yet.</p>}
          {catalogs.data && catalogs.data.length > 0 && (
            <div className={ui.configuredList}>
              {catalogs.data.map((catalog) => (
                <div className={ui.configuredRow} key={catalog.id}>
                  <span className={ui.catalogInitial} aria-hidden="true">{catalog.name.slice(0, 1).toUpperCase()}</span>
                  <span className={ui.configuredName}><strong>{catalog.name}</strong><code className={ui.configuredCode}>{catalog.id}</code></span>
                  <button
                    className={ui.removeButton}
                    disabled={removeCatalog.isPending}
                    onClick={() => removeCatalog.mutate(catalog.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {removeCatalog.isError && <ErrorMessage message={removeCatalog.error.message} />}
        </section>
        <p className={ui.settingsFootnote}>Catalog connection settings are stored in a local file on this server. Keep this app on a trusted machine.</p>
      </main>
    </div>
  )
}

function WorkersPage() {
  const workers = useQuery({ queryKey: ['workers'], queryFn: getWorkers })
  const statuses = useQueries({
    queries: (workers.data ?? []).map((worker) => ({
      queryKey: ['worker-status', worker.id],
      queryFn: () => getWorkerStatus(worker.id),
      staleTime: 30_000,
    })),
  })

  return (
    <div className={ui.settingsPage}>
      <header className={ui.topbar}>
        <Link className={ui.brand} to="/" aria-label="Iceberg Control Plane home">
          <span className={ui.brandMark} aria-hidden="true"><span className={ui.brandMarkInner} /></span>
          <span>Iceberg <strong>Control Plane</strong></span>
        </Link>
        <Link className={ui.backButton} to="/">Back to explorer</Link>
      </header>
      <main className={ui.settingsContent}>
        <div className={ui.settingsHeading}>
          <div><p className={ui.eyebrow}>Polyglot runtime</p><h1 className={ui.h1}>Iceberg workers</h1></div>
          <a className={ui.contractLink} href="https://github.com/fallintoplace/iceberg-control-plane/blob/main/workers/openapi.yaml" target="_blank" rel="noreferrer">Worker contract v1 ↗</a>
        </div>

        {workers.isPending && <Loading label="workers" />}
        {workers.isError && <ErrorMessage message="Could not load configured workers." />}
        {workers.data?.length === 0 && (
          <section className={`${ui.emptyState} ${ui.workerEmptyState}`}>
            <div className={ui.emptyIcon} aria-hidden="true">⌘</div>
            <p className={ui.eyebrow}>No workers configured</p>
            <h1 className={`${ui.h1} mb-[11px] text-[22px]`}>Add a Go, Java, or Rust worker</h1>
            <p className={ui.emptyParagraph}>Workers use the versioned HTTP contract. Each worker keeps its own catalog credentials and reports the Iceberg engine and operations it supports.</p>
            <pre className={`${ui.codeBlock} [overflow-wrap:anywhere]`}>{`ICEBERG_WORKERS_JSON='[{"id":"iceberg-go","name":"Iceberg Go","uri":"http://localhost:8090"}]'`}</pre>
          </section>
        )}
        {workers.data && workers.data.length > 0 && (
          <section className={ui.workerGrid} aria-label="Configured workers">
            {workers.data.map((worker, index) => {
              const statusQuery = statuses[index]
              const status = statusQuery?.data?.worker
              const isReady = status?.health.status === 'ready'
              return (
                <article className={`${ui.card} ${ui.workerCard}`} key={worker.id}>
                  <div className={ui.workerCardHeading}>
                    <span className={ui.catalogInitial} aria-hidden="true">{worker.name.slice(0, 1).toUpperCase()}</span>
                    <div className={ui.configuredName}><strong>{worker.name}</strong><code className={ui.configuredCode}>{worker.id}</code></div>
                    <span className={`${ui.workerState} ${isReady ? 'text-brand-dark' : status ? 'text-danger' : ''}`}>
                      <span className={`${ui.workerStateDot} ${isReady ? 'bg-[#24a786]' : status ? 'bg-[#c45145]' : ''}`} />{statusQuery?.isPending ? 'Checking' : statusQuery?.isError ? 'Offline' : status?.health.status ?? 'Unknown'}
                    </span>
                  </div>
                  {statusQuery?.isError && <p className={ui.workerError}>Check the worker URL and API credentials.</p>}
                  {status && (
                    <>
                      <div className={ui.workerRuntime}>
                        <span className={ui.workerLanguage}>{status.health.runtime.language}</span>
                        <span>{status.health.runtime.engine} {status.health.runtime.engineVersion}</span>
                        <span>Worker {status.health.runtime.version}</span>
                      </div>
                      <div className={ui.partitionBlock}>
                        <p className={`${ui.fieldLabel} mb-[9px]`}>Read-only operations</p>
                        {status.capabilities.operations.length === 0 ? <span className={ui.muted}>No operations advertised</span> : (
                          <div className={ui.tagList}>
                            {status.capabilities.operations.map((operation) => <span className={ui.tag} key={operation}>{operation}</span>)}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </article>
              )
            })}
          </section>
        )}
        <p className={ui.settingsFootnote}>Configure workers with <code className="font-mono text-[10px] text-[#536d67]">ICEBERG_WORKERS_JSON</code>. The control plane sends catalog IDs and table identifiers; workers resolve credentials from their own environment.</p>
      </main>
    </div>
  )
}

function Home() {
  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs })

  if (catalogs.isPending) return <Loading label="catalogs" />
  if (catalogs.isError) return <ErrorMessage message={catalogs.error.message} />
  if (catalogs.data.length === 0) return <EmptyCatalogs />

  return <Navigate to={`/catalog/${encodeURIComponent(catalogs.data[0]!.id)}`} replace />
}

function NamespaceLink({
  namespace,
  selected,
  onSelect,
  className = '',
}: {
  namespace: NamespaceIdentifier
  selected: string[]
  onSelect: (parts: string[]) => void
  className?: string
}) {
  const active = namespaceKey(namespace.namespace) === namespaceKey(selected)
  const name = namespace.namespace.at(-1) ?? namespace.namespace.join('.')

  return (
    <button
      className={`${ui.namespaceLink} ${active ? ui.namespaceLinkActive : ''} ${className}`}
      onClick={() => onSelect(namespace.namespace)}
      type="button"
      title={namespace.namespace.join('.')}
    >
      <span className={ui.namespaceGlyph} aria-hidden="true">▦</span>
      <span>{name}</span>
    </button>
  )
}

function CatalogExplorer() {
  const { catalogId = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedNamespace = searchParams.getAll('namespace')
  const selectedTable = searchParams.get('table')

  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs })
  const catalog = catalogs.data?.find((candidate) => candidate.id === catalogId)
  const status = useQuery({
    queryKey: ['catalog-status', catalogId],
    queryFn: () => getCatalogStatus(catalogId),
    enabled: Boolean(catalog),
    staleTime: 30_000,
  })
  const namespaces = useInfiniteQuery({
    queryKey: ['namespaces', catalogId, namespaceKey(selectedNamespace)],
    queryFn: ({ pageParam }) => getNamespaces(catalogId, selectedNamespace, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextPageToken,
    enabled: Boolean(catalog),
  })
  const tables = useInfiniteQuery({
    queryKey: ['tables', catalogId, namespaceKey(selectedNamespace)],
    queryFn: ({ pageParam }) => getTables(catalogId, selectedNamespace, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextPageToken,
    enabled: Boolean(catalog && selectedNamespace.length > 0),
  })
  const table = useQuery({
    queryKey: ['table', catalogId, namespaceKey(selectedNamespace), selectedTable],
    queryFn: () => getTable(catalogId, selectedNamespace, selectedTable!),
    enabled: Boolean(catalog && selectedTable && selectedNamespace.length > 0),
  })

  const setLocation = (namespace: string[], tableName?: string) => {
    const next = new URLSearchParams()
    namespace.forEach((part) => next.append('namespace', part))
    if (tableName) next.set('table', tableName)
    setSearchParams(next)
  }

  if (catalogs.isPending) return <Loading label="catalogs" />
  if (catalogs.isError) return <ErrorMessage message={catalogs.error.message} />
  if (catalogs.data.length === 0) return <EmptyCatalogs />
  if (!catalog) return <ErrorMessage message="This catalog is not configured on the server." />

  const namespaceItems = namespaces.data?.pages.flatMap((page) => page.namespaces) ?? []
  const tableItems = tables.data?.pages.flatMap((page) => page.tables) ?? []
  const parentNamespace = selectedNamespace.slice(0, -1)

  return (
    <div className={ui.appShell}>
      <header className={ui.topbar}>
        <Link className={ui.brand} to="/" aria-label="Iceberg Control Plane home">
          <span className={ui.brandMark} aria-hidden="true"><span className={ui.brandMarkInner} /></span>
          <span>Iceberg <strong>Control Plane</strong></span>
        </Link>
        <div className={ui.topbarRight}>
          <span className={`${ui.readOnlyBadge} max-[640px]:hidden`}><span className={ui.statusDot} />Read only</span>
          <Link className={ui.topbarLink} to="/workers">Workers</Link>
          <Link className={ui.topbarLink} to="/settings">Manage catalogs</Link>
          <span className={ui.topbarCaption}>Catalog operations</span>
        </div>
      </header>

      <div className={ui.workspace}>
        <aside className={ui.sidebar}>
          <div className={ui.sidebarSection}>
            <label className={ui.fieldLabel} htmlFor="catalog-select">Catalog</label>
            <select
              className={ui.catalogSelect}
              id="catalog-select"
              value={catalog.id}
              onChange={(event) => navigate(`/catalog/${encodeURIComponent(event.target.value)}`)}
            >
              {catalogs.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <div className={`${ui.connectionState} ${status.isError ? 'text-danger' : ''}`}>
              <span className={`${ui.statusDot} ${status.isError ? 'bg-[#c45145]' : ''}`} />
              {status.isPending ? 'Checking connection' : status.isError ? 'Connection unavailable' : 'Connected'}
            </div>
            {status.isError && <p className={ui.sidebarError}>Check the catalog URI and server credentials.</p>}
          </div>

          <div className={ui.sidebarSectionCompact}>
            <div className={ui.sectionTitleRow}>
              <span className={ui.fieldLabel}>Namespaces</span>
              <span className={ui.countPill}>{namespaceItems.length}</span>
            </div>
            <button className={`${ui.namespaceLink} ${selectedNamespace.length === 0 ? ui.namespaceLinkActive : ''}`} onClick={() => setLocation([])} type="button">
              <span className={ui.namespaceGlyph} aria-hidden="true">⌂</span>
              <span>All namespaces</span>
            </button>
            {selectedNamespace.length > 0 && (
              <button className={`${ui.namespaceLink} ${ui.parentLink}`} onClick={() => setLocation(parentNamespace)} type="button">
                <span className={ui.namespaceGlyph} aria-hidden="true">↰</span>
                <span>{parentNamespace.at(-1) ?? 'Root'}</span>
              </button>
            )}
            {namespaces.isPending && <p className={`${ui.muted} ${ui.compact}`}>Loading…</p>}
            {namespaces.isError && <p className={ui.sidebarError}>Could not load namespaces.</p>}
            <div className={ui.namespaceList}>
              {namespaceItems.map((item) => (
                <NamespaceLink
                  key={namespaceKey(item.namespace)}
                  namespace={item}
                  selected={selectedNamespace}
                  onSelect={(parts) => setLocation(parts)}
                />
              ))}
            </div>
            {namespaces.hasNextPage && (
              <button className={ui.loadMore} onClick={() => void namespaces.fetchNextPage()} disabled={namespaces.isFetchingNextPage}>
                {namespaces.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
          <div className={ui.sidebarFootnote}>Catalog credentials stay on the server.</div>
        </aside>

        <main className={ui.mainContent}>
          <div className={ui.pageHeading}>
            <div>
              <p className={ui.eyebrow}>Catalog explorer</p>
              <h1 className={ui.h1}>{selectedTable ?? selectedNamespace.at(-1) ?? catalog.name}</h1>
              <nav className={ui.breadcrumbs} aria-label="Breadcrumb">
                <button className={ui.breadcrumbButton} onClick={() => setLocation([])} type="button">{catalog.name}</button>
                {selectedNamespace.map((part, index) => (
                  <span key={`${part}-${index}`}>
                    <span className={ui.breadcrumbSeparator}>/</span>
                    <button className={ui.breadcrumbButton} onClick={() => setLocation(selectedNamespace.slice(0, index + 1))} type="button">{part}</button>
                  </span>
                ))}
                {selectedTable && <span><span className={ui.breadcrumbSeparator}>/</span>{selectedTable}</span>}
              </nav>
            </div>
            <div className={ui.headingMeta}>
              <span className={ui.metaLabel}>REST endpoint</span>
              <span className={ui.metaValue}>{status.data ? `${status.data.endpoints.length} advertised features` : '—'}</span>
            </div>
          </div>

          {selectedTable ? (
            <TableDetails
              catalogId={catalog.id}
              namespace={selectedNamespace}
              query={table}
              tableName={selectedTable}
              onBack={() => setLocation(selectedNamespace)}
            />
          ) : selectedNamespace.length === 0 ? (
            <section className={ui.card}>
              <div className={`${ui.sectionTitleRow} ${ui.contentTitle}`}>
                <div><p className={ui.eyebrow}>Browse</p><h2 className={ui.h2}>Top-level namespaces</h2></div>
                <span className={ui.countPill}>{namespaceItems.length}</span>
              </div>
              {namespaces.isError && <ErrorMessage message="The catalog did not return its namespaces." />}
              {namespaceItems.length === 0 && !namespaces.isPending && <p className={ui.muted}>No namespaces were found in this catalog.</p>}
              <div className={ui.namespaceGrid}>
                {namespaceItems.map((item) => (
                  <button className={ui.namespaceCard} key={namespaceKey(item.namespace)} onClick={() => setLocation(item.namespace)} type="button">
                    <span className={ui.namespaceCardIcon} aria-hidden="true">▦</span>
                    <span className={ui.namespaceCardName}>{item.namespace.join(' / ')}</span>
                    <span className={ui.namespaceCardArrow} aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
              {namespaces.hasNextPage && (
                <button className={ui.secondaryButton} onClick={() => void namespaces.fetchNextPage()} disabled={namespaces.isFetchingNextPage}>
                  {namespaces.isFetchingNextPage ? 'Loading…' : 'Load more namespaces'}
                </button>
              )}
            </section>
          ) : (
            <section className={ui.card}>
              <div className={`${ui.sectionTitleRow} ${ui.contentTitle}`}>
                <div><p className={ui.eyebrow}>Namespace</p><h2 className={ui.h2}>{selectedNamespace.join(' / ')}</h2></div>
                <span className={ui.countPill}>{tableItems.length} tables</span>
              </div>
              {namespaces.isError && <ErrorMessage message="Could not load child namespaces." />}
              {namespaceItems.length > 0 && (
                <div className={ui.childNamespaceList}>
                  <p className={`${ui.fieldLabel} mb-2`}>Child namespaces</p>
                  {namespaceItems.map((item) => (
                    <NamespaceLink
                      key={namespaceKey(item.namespace)}
                      namespace={item}
                      selected={selectedNamespace}
                      onSelect={(parts) => setLocation(parts)}
                      className="max-w-[420px] border border-[#edf1f0]"
                    />
                  ))}
                  {namespaces.hasNextPage && (
                    <button className={ui.loadMore} onClick={() => void namespaces.fetchNextPage()} disabled={namespaces.isFetchingNextPage}>
                      {namespaces.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </button>
                  )}
                </div>
              )}
              <div className={ui.tableListHeading}><p className={ui.fieldLabel}>Tables</p></div>
              {tables.isPending && <Loading label="tables" />}
              {tables.isError && <ErrorMessage message="The catalog did not return its tables." />}
              {tableItems.length === 0 && !tables.isPending && !tables.isError && <p className={ui.muted}>No tables in this namespace.</p>}
              {tableItems.length > 0 && (
                <div className={ui.tableList}>
                  {tableItems.map((item: TableIdentifier) => (
                    <button className={`${ui.tableRow} group`} key={`${namespaceKey(item.namespace)}:${item.name}`} onClick={() => setLocation(selectedNamespace, item.name)} type="button">
                      <span className={ui.tableIcon} aria-hidden="true">▤</span>
                      <span className={ui.tableName}>{item.name}</span>
                      <span className={ui.tableRowHint}>Inspect table <span aria-hidden="true">→</span></span>
                    </button>
                  ))}
                </div>
              )}
              {tables.hasNextPage && (
                <button className={ui.secondaryButton} onClick={() => void tables.fetchNextPage()} disabled={tables.isFetchingNextPage}>
                  {tables.isFetchingNextPage ? 'Loading…' : 'Load more tables'}
                </button>
              )}
            </section>
          )}
          <footer className={ui.pageFooter}>Read-only catalog browsing · Iceberg REST API</footer>
        </main>
      </div>
    </div>
  )
}

function TableDetails({
  catalogId,
  namespace,
  query,
  tableName,
  onBack,
}: {
  catalogId: string
  namespace: string[]
  query: UseQueryResult<{ table: TableSummary }, Error>
  tableName: string
  onBack: () => void
}) {
  if (query.isPending) return <Loading label="table metadata" />
  if (query.isError) {
    return (
      <section className={ui.card}>
        <button className={ui.backButton} onClick={onBack} type="button">← Back to tables</button>
        <ErrorMessage message={`Could not load ${tableName}. Check the catalog connection and table permissions.`} />
      </section>
    )
  }

  const table = query.data.table
  return (
    <div className={ui.detailsStack}>
      <TableWorkerJobs key={JSON.stringify([catalogId, namespace, tableName])} catalogId={catalogId} namespace={namespace} tableName={tableName} />
      <div className={ui.detailStats}>
        <div className={ui.statCard}><span className={ui.statLabel}>Format version</span><strong className={ui.statValue}>v{table.formatVersion}</strong></div>
        <div className={ui.statCard}><span className={ui.statLabel}>Snapshots</span><strong className={ui.statValue}>{table.snapshotCount}</strong></div>
        <div className={ui.statCard}><span className={ui.statLabel}>Current snapshot</span><strong className={`${ui.statValue} ${ui.statId}`}>{table.currentSnapshotId ?? 'None'}</strong></div>
        <div className={ui.statCard}><span className={ui.statLabel}>Last updated</span><strong className={`${ui.statValue} ${ui.statDate}`}>{formatDate(table.lastUpdatedMs)}</strong></div>
      </div>

      <section className={ui.card}>
        <div className={`${ui.sectionTitleRow} ${ui.contentTitle}`}>
          <div><p className={ui.eyebrow}>Table metadata</p><h2 className={ui.h2}>Current schema</h2></div>
          <button className={ui.backButton} onClick={onBack} type="button">← Back to tables</button>
        </div>
        {table.currentSchema ? (
          <div className={ui.schemaWrap}>
            <table className={ui.schemaTable}>
              <thead><tr><th className={ui.schemaTh}>Field</th><th className={ui.schemaTh}>Type</th><th className={ui.schemaTh}>Required</th></tr></thead>
              <tbody>
                {table.currentSchema.fields.map((field) => (
                  <tr key={field.id}>
                    <td className={`${ui.schemaTd} font-mono text-[#253c40]`}><span className={ui.fieldId}>#{field.id}</span>{field.name}</td>
                    <td className={ui.schemaTd}><code className={ui.schemaCode}>{typeof field.type === 'string' ? field.type : field.type.type}</code></td>
                    <td className={ui.schemaTd}>{field.required ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={ui.muted}>No current schema was returned.</p>}
        {table.currentPartitionSpec && (
          <div className={ui.partitionBlock}>
            <p className={`${ui.fieldLabel} mb-[9px]`}>Current partition spec</p>
            {table.currentPartitionSpec.fields.length === 0 ? <span className={ui.muted}>Unpartitioned</span> : (
              <div className={ui.tagList}>
                {table.currentPartitionSpec.fields.map((field) => <span className={ui.tag} key={field['field-id']}>{field.name} <code className={ui.tagCode}>{field.transform}</code></span>)}
              </div>
            )}
          </div>
        )}
        <div className={ui.partitionBlock}>
          <p className={`${ui.fieldLabel} mb-[9px]`}>Branches and tags</p>
          {Object.keys(table.refs).length === 0 ? <span className={ui.muted}>No snapshot references</span> : (
            <div className={ui.tagList}>
              {Object.entries(table.refs).map(([name, ref]) => (
                <span className={ui.tag} key={name}>{name} <code className={ui.tagCode}>{ref.type}</code></span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={ui.card}>
        <div className={`${ui.sectionTitleRow} ${ui.contentTitle}`}>
          <div><p className={ui.eyebrow}>Table history</p><h2 className={ui.h2}>Snapshots</h2></div>
          <span className={ui.countPill}>{table.snapshotCount}</span>
        </div>
        {table.snapshotsTruncated && <p className={`${ui.muted} ${ui.compact}`}>Showing the 100 most recent snapshots.</p>}
        {table.snapshots.length === 0 ? <p className={ui.muted}>No snapshots were returned.</p> : (
          <div className={ui.snapshotList}>
            {table.snapshots.map((snapshot) => (
              <div className={ui.snapshotRow} key={snapshot.snapshotId}>
                <span className={`${ui.operationIcon} ${snapshot.operation === 'delete' ? 'bg-[#fbf1ef] text-[#ae6256]' : snapshot.operation === 'replace' || snapshot.operation === 'overwrite' ? 'bg-[#faf6e9] text-[#967a39]' : ''}`} aria-hidden="true">{snapshot.operation === 'append' ? '＋' : snapshot.operation === 'delete' ? '−' : '↻'}</span>
                <div className={ui.snapshotMain}>
                  <strong className={ui.snapshotOperation}>{snapshot.operation}</strong>
                  <span className={ui.snapshotDate}>{formatDate(snapshot.timestampMs)}</span>
                </div>
                <span className={ui.snapshotId}>{snapshot.snapshotId}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function displayCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatEngineName(engine: string): string {
  return engine.split(/[/-]/).filter(Boolean).map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`).join(' ')
}

function WorkerResult({ result }: { result: Record<string, unknown> }) {
  const fields = Array.isArray(result.schema) ? result.schema.filter(isRecord) : []
  const rows = Array.isArray(result.rows) ? result.rows.filter(isRecord) : []
  const namespaces = Array.isArray(result.namespaces) ? result.namespaces.filter(Array.isArray) : []
  const columns = fields.flatMap((field) => typeof field.name === 'string' ? [field.name] : [])
  const showsRequired = fields.some((field) => typeof field.required === 'boolean')

  return (
    <div className={ui.workerResult}>
      <div className={ui.workerResultStats}>
        {typeof result.formatVersion === 'number' && <div className={ui.workerResultStat}><span className={ui.workerResultStatLabel}>Format</span><strong className={ui.workerResultStatValue}>v{result.formatVersion}</strong></div>}
        {typeof result.snapshotCount === 'number' && <div className={ui.workerResultStat}><span className={ui.workerResultStatLabel}>Snapshots</span><strong className={ui.workerResultStatValue}>{result.snapshotCount}</strong></div>}
        {typeof result.namespaceCount === 'number' && <div className={ui.workerResultStat}><span className={ui.workerResultStatLabel}>Namespaces</span><strong className={ui.workerResultStatValue}>{result.namespaceCount}</strong></div>}
        {typeof result.rowCount === 'number' && <div className={ui.workerResultStat}><span className={ui.workerResultStatLabel}>Rows returned</span><strong className={ui.workerResultStatValue}>{result.rowCount}</strong></div>}
      </div>
      {fields.length > 0 && (
        <div className={ui.workerResultTableWrap}>
          <table className={ui.workerResultTable}>
            <thead><tr><th className={ui.workerResultTh}>Field</th><th className={ui.workerResultTh}>Type</th>{showsRequired && <th className={ui.workerResultTh}>Required</th>}</tr></thead>
            <tbody>{fields.map((field, index) => (
              <tr key={`${String(field.id ?? index)}:${String(field.name ?? '')}`}>
                <td className={ui.workerResultTd}>{typeof field.name === 'string' ? field.name : 'Field'}</td>
                <td className={ui.workerResultTd}><code className={ui.workerResultCode}>{typeof field.type === 'string' ? field.type : '—'}</code></td>
                {showsRequired && <td className={ui.workerResultTd}>{field.required === true ? 'Yes' : 'No'}</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <div className={ui.workerResultTableWrap}>
          <table className={ui.workerResultTable}>
            <thead><tr>{(columns.length > 0 ? columns : Object.keys(rows[0]!)).map((column) => <th className={ui.workerResultTh} key={column}>{column}</th>)}</tr></thead>
            <tbody>{rows.map((row, index) => (
              <tr key={index}>{(columns.length > 0 ? columns : Object.keys(rows[0]!)).map((column) => (
                <td className={ui.workerResultTd} key={column}>{displayCell(row[column])}</td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {namespaces.length > 0 && (
        <div className={ui.tagList}>
          {namespaces.map((namespace, index) => <span className={ui.tag} key={index}>{namespace.map(String).join(' / ')}</span>)}
        </div>
      )}
      <details className={ui.workerRawResult}>
        <summary>Raw result</summary>
        <pre className={ui.workerRawPre}>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </div>
  )
}

function TableWorkerJobs({ catalogId, namespace, tableName }: { catalogId: string; namespace: string[]; tableName: string }) {
  const workers = useQuery({ queryKey: ['workers'], queryFn: getWorkers, staleTime: 30_000 })
  const [workerId, setWorkerId] = useState('')
  const [rowLimit, setRowLimit] = useState(10)
  const [jobId, setJobId] = useState('')
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
  const changeWorker = (nextWorkerId: string) => {
    setWorkerId(nextWorkerId)
    setJobId('')
    submit.reset()
  }
  const sendJob = (operation: WorkerJobSubmission['operation']) => {
    setJobId('')
    submit.reset()
    if (operation === 'catalog.validate') {
      submit.mutate({ protocolVersion: 1, operation, catalogId })
      return
    }
    if (operation === 'table.inspect') {
      submit.mutate({ protocolVersion: 1, operation, catalogId, table: { namespace, name: tableName } })
      return
    }
    submit.mutate({
      protocolVersion: 1,
      operation,
      catalogId,
      table: { namespace, name: tableName },
      options: { rowLimit },
    })
  }

  if (workers.isPending) {
    return <section className={ui.workerJobCard}><Loading label="workers" /></section>
  }
  if (workers.isError) {
    return <section className={ui.workerJobCard}><ErrorMessage message="Could not load workers." /></section>
  }
  if (workers.data.length === 0) {
    return (
      <section className={ui.workerJobCard}>
        <div className={ui.contentTitle}><p className={ui.eyebrow}>Iceberg workers</p><h2 className={ui.h2}>Run this table through a worker</h2></div>
        <p className={ui.muted}>Configure a worker to inspect this table and read sample rows.</p>
        <Link className={`${ui.secondaryButton} ${ui.workerConfigLink}`} to="/workers">Open worker settings</Link>
      </section>
    )
  }

  const selectedWorker = workers.data.find((worker) => worker.id === activeWorkerId)
  const runtime = workerStatus.data?.worker.health.runtime
  const engineName = runtime ? formatEngineName(runtime.engine) : 'Iceberg worker'
  const currentJob: WorkerJob | undefined = job.data?.job
  return (
    <section className={ui.workerJobCard} aria-label={`${selectedWorker?.name ?? 'Iceberg worker'} operations`}>
      <div className={ui.workerJobHeading}>
        <div><p className={ui.eyebrow}>Powered by {engineName}</p><h2 className={ui.h2}>Try this table with {selectedWorker?.name ?? 'a worker'}</h2></div>
        {workers.data.length > 1 ? (
          <label className={ui.workerSelectLabel}>
            <span className={ui.fieldLabel}>Worker</span>
            <select className={ui.workerSelect} value={activeWorkerId} onChange={(event) => changeWorker(event.target.value)}>
              {workers.data.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
            </select>
          </label>
        ) : <span className={`${ui.workerState} ${ready ? 'text-brand-dark' : workerStatus.data ? 'text-danger' : ''}`}><span className={`${ui.workerStateDot} ${ready ? 'bg-[#24a786]' : workerStatus.data ? 'bg-[#c45145]' : ''}`} />{selectedWorker?.name ?? workers.data[0]!.name}</span>}
      </div>
      {workerStatus.isPending && <p className={ui.muted}>Checking worker…</p>}
      {workerStatus.isError && <ErrorMessage message="The worker is offline. Check its URL and API credentials." />}
      {workerStatus.data && (
        <>
          <div className={ui.workerJobRuntime}>
            <span className={ui.workerLanguage}>{runtime ? `${runtime.language[0]!.toUpperCase()}${runtime.language.slice(1)} ${runtime.engineVersion}` : 'Worker runtime'}</span>
            <span>{runtime?.version}</span>
            <span className={`${ui.workerState} ${ready ? 'text-brand-dark' : 'text-danger'}`}><span className={`${ui.workerStateDot} ${ready ? 'bg-[#24a786]' : 'bg-[#c45145]'}`} />{workerStatus.data.worker.health.status}</span>
          </div>
          {!ready && <p className={ui.muted}>This worker is degraded. Results may not be available.</p>}
          <div className={ui.workerJobActions}>
            <button className={`${ui.secondaryButton} ${ui.workerActionButton}`} disabled={!ready || submit.isPending || !operations.includes('catalog.validate')} onClick={() => sendJob('catalog.validate')} type="button">Validate catalog</button>
            <button className={`${ui.secondaryButton} ${ui.workerActionButton}`} disabled={!ready || submit.isPending || !operations.includes('table.inspect')} onClick={() => sendJob('table.inspect')} type="button">Inspect with {runtime ? `${runtime.language[0]!.toUpperCase()}${runtime.language.slice(1)}` : 'worker'}</button>
            <label className={ui.workerRowLimit}>
              <span className={ui.fieldLabel}>Rows</span>
              <input className={ui.workerRowInput} aria-label="Sample row limit" max={100} min={1} onChange={(event) => setRowLimit(Number(event.target.value))} step={1} type="number" value={rowLimit} />
            </label>
            <button className={`${ui.primaryButton} ${ui.workerActionButton}`} disabled={!ready || submit.isPending || !operations.includes('table.sample') || !Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 100} onClick={() => sendJob('table.sample')} type="button">{submit.isPending ? 'Submitting…' : 'Sample rows'}</button>
          </div>
          {submit.isError && <ErrorMessage message={submit.error.message} />}
          {job.isError && <ErrorMessage message={job.error.message} />}
          {currentJob && (
            <div className={ui.workerJobOutput} aria-live="polite">
              <div className={ui.workerJobOutputHeading}>
                <div><p className={ui.eyebrow}>Go worker result</p><span className={ui.workerJobId}>Job {currentJob.jobId}</span></div>
                <span className={`${ui.workerJobStatus} ${currentJob.status === 'succeeded' ? 'bg-brand-soft text-brand-dark' : currentJob.status === 'failed' ? 'bg-[#fbf1ef] text-[#a34a41]' : ''}`}>{currentJob.status}{currentJob.progress !== undefined ? ` · ${Math.round(currentJob.progress * 100)}%` : ''}</span>
              </div>
              {currentJob.status === 'failed' && currentJob.error && <ErrorMessage message={currentJob.error.message} />}
              {currentJob.status === 'succeeded' && currentJob.result && <WorkerResult result={currentJob.result} />}
              {(currentJob.status === 'queued' || currentJob.status === 'running') && <p className={ui.muted}>Reading table metadata and files with Apache Iceberg Go…</p>}
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<CatalogSettings />} />
        <Route path="/workers" element={<WorkersPage />} />
        <Route path="/catalog/:catalogId" element={<CatalogExplorer />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
