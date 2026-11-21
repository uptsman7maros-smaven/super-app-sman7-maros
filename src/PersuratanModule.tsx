import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import {
  LayoutDashboard, FilePlus2, Files, Inbox, Send, Archive, ClipboardCheck, Search, Bell,
  X, ChevronLeft, ChevronRight, Plus, RefreshCw, ShieldCheck, Mail, BookOpen, Printer, Download,
  Check, FileText, Sparkles, Upload, Copy, Pencil, Eye, Trash2, UserRound, Settings2
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getValidSupabaseSession, isSupabaseRateLimitError, supabase } from './lib/supabase'
import { isLetterInProgress } from './lib/letterMetrics'
import { logAppActivity } from './services/activityLogService'
import { useSchoolContext } from './context/useSchoolContext'
import PersonPicker from './components/shared/PersonPicker'
import { SchoolLetterheadPicker } from './components/shared/SchoolLetterheadPicker'
import { getSchoolLetterhead, type LetterheadSlot, type SchoolSettings } from './services/masterDataService'
import type { PersonOption } from './services/masterDataService'
import './PersuratanModule.css'

type Page = 'dashboard' | 'create' | 'requests' | 'approvals' | 'issued' | 'archive' | 'incoming' | 'outgoing' | 'dispositions' | 'templates'
type LetterRole = 'administrator' | 'operator' | 'guru_staf' | 'pemohon' | 'staf_tu' | 'kepala_tu' | 'kepala_sekolah'
type LetterStatus = 'draft' | 'submitted' | 'in_review' | 'revision' | 'resubmitted' | 'approved' | 'awaiting_number' | 'issued' | 'rejected' | 'archived'
type PaperSize = 'A4' | 'F4'
type LogoPosition = 'left' | 'top' | 'none'
type LetterDocumentMarkup = { html: string; header: string; paperSize: PaperSize; isDraft: boolean; title: string }
type TemplateField = {
  name: string
  label: string
  required?: boolean
  type?: 'text' | 'textarea' | 'date' | 'time' | 'auto_user' | 'auto_school' | 'kepala_tu_only' | 'student' | 'teacher'
}
type LetterTemplate = {
  id: string
  category_id?: string | null
  name: string
  description?: string | null
  subject?: string | null
  html_content?: string
  source_file_path?: string | null
  page_settings?: { size?: PaperSize; margin_mm?: number; logo_position?: LogoPosition }
  requires_principal_approval?: boolean
  requires_number?: boolean
  is_active?: boolean
  category?: { name: string; code?: string } | null
  fields_schema: TemplateField[]
}
type LetterRequest = {
  id: string
  request_code: string
  template_id: string
  requester_id: string
  requester_name: string
  requester_nip: string | null
  requester_position: string | null
  subject: string
  form_data: Record<string, unknown>
  status: LetterStatus
  admin_note?: string | null
  created_at: string
  updated_at?: string | null
  approved_at?: string | null
  issued_at?: string | null
  downloaded_at?: string | null
  letter_templates?: {
    name?: string
    category_id?: string | null
    requires_principal_approval?: boolean
    requires_number?: boolean
    html_content?: string
    fields_schema?: TemplateField[]
    page_settings?: LetterTemplate['page_settings']
  } | null
  letter_issued?: ({
    letter_number: string
    issue_date: string
    signer_name: string | null
    signer_position: string | null
    signer_nip: string | null
    html_snapshot?: string | null
  } | null)[] | {
    letter_number: string
    issue_date: string
    signer_name: string | null
    signer_position: string | null
    signer_nip: string | null
    html_snapshot?: string | null
  } | null
  letter_approvals?: { approver_role: string; decision: string }[] | null
}
type IssueForm = {
  letter_number: string
  issue_date: string
  signer_name: string
  signer_position: string
  signer_nip: string
  ktu_fields: Record<string, string>
}
type IncomingLetter = {
  id: string
  external_number: string
  sender: string
  subject: string
  received_date: string
  follow_up_status: string
}
type LetterCategory = { id: string; name: string; code: string }
type LetterSignatory = { full_name: string; nip: string | null; employment_status: string | null }
type LetterNotification = { id: string; title: string; body: string; created_at: string; is_read: boolean; letter_request_id?: string | null }
type CurrentUser = { id?: string; username?: string; role?: string; full_name?: string; nip_or_nisn?: string; jabatan?: string | null; class_name?: string | null }
type LetterModal = null | { type: 'template' | 'incoming' | 'notifications' | 'review' | 'issue' | 'preview' }
type NavItem = { label: string; icon: LucideIcon; key: Page }
type LetterForm = Record<string, string>
type StudentLetterPrefill = {
  id: string
  full_name: string
  nisn: string
  class_id: string | null
  class_name: string
  context: string
}

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{\s*([a-zA-Z0-9_]+)\s*\}/g
const USER_TOKEN_NAMES = new Set(['nama', 'nip', 'jabatan'])
const OFFICE_TOKEN_NAMES = new Set(['nomor_surat', 'tanggal_terbit', 'penandatangan', 'nip_penandatangan'])
const SCHOOL_PROFILE_TOKEN_NAMES = new Set(['nama_kepala_sekolah', 'nip_kepala_sekolah'])
const BURSAR_TOKEN_NAMES = new Set(['nama_bendahara', 'nip_bendahara'])
const TU_COMPLETABLE_TOKEN_NAMES = new Set(['hari_tanggal', 'tanggal_surat', 'tempat'])
const GLOBAL_REQUEST_ROLES = new Set<LetterRole>(['administrator', 'operator', 'kepala_tu', 'staf_tu', 'kepala_sekolah'])
const ALLOWED_TEMPLATE_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'caption', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'li', 'ol', 'p', 's', 'span', 'strong', 'sub', 'sup', 'table', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
])
const SAFE_TEMPLATE_STYLE_PROPERTIES = new Set([
  'border', 'border-bottom', 'border-collapse', 'border-left', 'border-right', 'border-top',
  'break-after', 'break-before',
  'color', 'font-family', 'font-size', 'font-style', 'font-weight', 'line-height', 'margin',
  'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'page-break-after', 'page-break-before',
  'padding', 'text-align', 'text-decoration', 'text-indent', 'vertical-align', 'width',
])

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}

function tokenNameFromMatch(match: RegExpExecArray) {
  return match[1] ?? match[2] ?? ''
}

function normalizeTemplateField(field: TemplateField): TemplateField {
  const normalized = field.name.toLocaleLowerCase('id-ID')
  if (SCHOOL_PROFILE_TOKEN_NAMES.has(normalized)) return { ...field, required: false, type: 'auto_school' }
  if (TU_COMPLETABLE_TOKEN_NAMES.has(normalized)) return { ...field, required: false, type: 'text' }
  if (OFFICE_TOKEN_NAMES.has(normalized)) return { ...field, required: false, type: 'kepala_tu_only' }
  return field
}

function detectTemplateFields(html: string, existing: TemplateField[] = []): TemplateField[] {
  const existingByName = new Map(existing.map(field => [field.name.toLocaleLowerCase('id-ID'), field]))
  const found = new Set<string>()
  for (const match of html.matchAll(TOKEN_PATTERN)) found.add(tokenNameFromMatch(match))
  return [...found].map(name => {
    const normalized = name.toLocaleLowerCase('id-ID')
    const previous = existingByName.get(normalized)
    if (previous) return normalizeTemplateField({ ...previous, name })
    return normalizeTemplateField({
      name,
      label: normalized.replaceAll('_', ' ').replace(/\b\p{L}/gu, letter => letter.toLocaleUpperCase('id-ID')),
      required: !OFFICE_TOKEN_NAMES.has(normalized) && !TU_COMPLETABLE_TOKEN_NAMES.has(normalized) && !SCHOOL_PROFILE_TOKEN_NAMES.has(normalized),
      type: USER_TOKEN_NAMES.has(normalized)
        ? 'auto_user'
        : SCHOOL_PROFILE_TOKEN_NAMES.has(normalized) ? 'auto_school'
          : OFFICE_TOKEN_NAMES.has(normalized) ? 'kepala_tu_only' : 'text',
    })
  })
}

function schoolProfileTokenValue(name: string, settings: SchoolSettings | null) {
  switch (name.toLocaleLowerCase('id-ID')) {
    case 'nama_kepala_sekolah': return settings?.principal_name?.trim() ?? ''
    case 'nip_kepala_sekolah': return settings?.principal_nip?.trim() ?? ''
    default: return ''
  }
}

function findPrincipal(signatories: LetterSignatory[]) {
  return signatories.find(item => /kepala\s*sekolah/i.test(item.employment_status || ''))
}

function findBursar(signatories: LetterSignatory[]) {
  return signatories
    .filter(item => /bendahara/i.test(item.employment_status || ''))
    .sort((first, second) => {
      const rank = (status: string | null) => /bendahara\s+pengeluaran/i.test(status || '') ? 0 : 1
      return rank(first.employment_status) - rank(second.employment_status)
    })[0]
}

function schoolOfficerTokenValue(name: string, settings: SchoolSettings | null, signatories: LetterSignatory[]) {
  const principal = findPrincipal(signatories)
  switch (name.toLocaleLowerCase('id-ID')) {
    case 'nama_kepala_sekolah': return principal?.full_name?.trim() || schoolProfileTokenValue(name, settings)
    case 'nip_kepala_sekolah': return principal?.nip?.trim() || schoolProfileTokenValue(name, settings)
    case 'nama_bendahara': return findBursar(signatories)?.full_name?.trim() || ''
    case 'nip_bendahara': return findBursar(signatories)?.nip?.trim() || ''
    default: return ''
  }
}

function isFinalNoNumberApproval(request: LetterRequest) {
  if (request.status !== 'approved' || request.letter_templates?.requires_number !== false) return false
  return !request.letter_templates.requires_principal_approval
    || Boolean(request.letter_approvals?.some(approval => approval.approver_role === 'kepala_sekolah' && approval.decision === 'approved'))
}

function isRequestExpiryEligible(request: LetterRequest) {
  return request.status === 'issued' || isFinalNoNumberApproval(request)
}

function requestExpiryAt(request: LetterRequest) {
  if (!isRequestExpiryEligible(request)) return null
  const start = request.issued_at || request.approved_at || request.updated_at || request.created_at
  const timestamp = Date.parse(start)
  return Number.isFinite(timestamp) ? timestamp + 48 * 60 * 60 * 1000 : null
}

function formatRemainingTime(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  if (days) return `${days} hari ${hours} jam ${minutes} menit`
  if (hours) return `${hours} jam ${minutes} menit`
  return `${minutes} menit`
}

function sanitizeTemplateHtml(value: string): string {
  if (typeof DOMParser === 'undefined') return escapeHtml(value)
  const parsed = new DOMParser().parseFromString(value, 'text/html')
  const sanitizeNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '')
    if (!(node instanceof Element)) return ''
    const tag = node.tagName.toLocaleLowerCase('en-US')
    if (['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'].includes(tag)) return ''
    const children = [...node.childNodes].map(sanitizeNode).join('')
    if (!ALLOWED_TEMPLATE_TAGS.has(tag)) return children
    const attributes: string[] = []
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLocaleLowerCase('en-US')
      const content = attribute.value.trim()
      if (name === 'style') {
        const safeStyles = content.split(';').map(rule => {
          const separator = rule.indexOf(':')
          if (separator < 0) return ''
          const property = rule.slice(0, separator).trim().toLocaleLowerCase('en-US')
          const styleValue = rule.slice(separator + 1).trim()
          return SAFE_TEMPLATE_STYLE_PROPERTIES.has(property) && !/(url|expression|javascript)/i.test(styleValue)
            ? `${property}:${styleValue}`
            : ''
        }).filter(Boolean).join(';')
        if (safeStyles) attributes.push(`style="${escapeHtml(safeStyles)}"`)
      } else if (['colspan', 'rowspan', 'scope', 'start', 'alt', 'width', 'height'].includes(name)) {
        attributes.push(`${name}="${escapeHtml(content)}"`)
      } else if (name === 'data-page-break' && ['before', 'after'].includes(content.toLocaleLowerCase('en-US'))) {
        attributes.push(`${name}="${content.toLocaleLowerCase('en-US')}"`)
      } else if (name === 'href' && /^(https?:|mailto:|\/(?!\/)|#)/i.test(content)) {
        attributes.push(`href="${escapeHtml(content)}"`)
      } else if (name === 'src' && /^(https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(content)) {
        attributes.push(`src="${escapeHtml(content)}"`)
      }
    }
    const attributeText = attributes.length ? ` ${attributes.join(' ')}` : ''
    return ['br', 'hr', 'img'].includes(tag)
      ? `<${tag}${attributeText}>`
      : `<${tag}${attributeText}>${children}</${tag}>`
  }
  return [...parsed.body.childNodes].map(sanitizeNode).join('')
}

function renderTemplateContent(
  html: string,
  values: Record<string, unknown>,
  fields: TemplateField[] = [],
) {
  const valueByName = new Map(
    Object.entries(values).map(([name, value]) => [name.toLocaleLowerCase('id-ID'), value]),
  )
  const labelByName = new Map(fields.map(field => [field.name.toLocaleLowerCase('id-ID'), field.label]))
  return sanitizeTemplateHtml(html).replace(
    TOKEN_PATTERN,
    (_token, doubleName: string | undefined, singleName: string | undefined) => {
      const name = doubleName ?? singleName ?? ''
      const normalized = name.toLocaleLowerCase('id-ID')
      const value = valueByName.get(normalized)
      if (value !== undefined && value !== null && String(value).trim()) return escapeHtml(String(value))
      if (normalized === 'nomor_surat') return '[Menunggu Nomor dari Kepala TU]'
      if (OFFICE_TOKEN_NAMES.has(normalized)) return `[${labelByName.get(normalized) ?? name}]`
      return `[${labelByName.get(normalized) ?? name.replaceAll('_', ' ')}]`
    },
  )
}

function makeLetterheadHtml(settings: SchoolSettings | null, slot: LetterheadSlot, logoPosition: LogoPosition) {
  if(logoPosition==='none')return ''
  const header = getSchoolLetterhead(settings, slot)
  const safeImageUrl = (url: string) => /^(?:https?:\/\/|\/(?!\/))/i.test(url) ? escapeHtml(url) : ''
  return `<div class="letter-document-header kop-${header.layout} logo-${logoPosition}">
    <img class="province-logo" src="${safeImageUrl(header.province_logo_url)}" alt="">
    <div class="letter-document-heading">
      <p>PEMERINTAH PROVINSI SULAWESI SELATAN</p>
      <p>DINAS PENDIDIKAN</p>
      <h2>${escapeHtml(header.school_name)}</h2>
      <p>${escapeHtml(header.letterhead)}</p>
    </div>
    ${header.layout === '2' ? `<img class="school-logo" src="${safeImageUrl(header.school_logo_url)}" alt="">` : ''}
    <div class="letter-document-rules"></div>
  </div>`
}

async function waitForPrintImages(root:ParentNode){
  await Promise.all(Array.from(root.querySelectorAll('img')).map(async image=>{
    if(!image.getAttribute('src')){image.remove();return}
    if(!image.complete){
      await new Promise<void>((resolve,reject)=>{
        const timer=window.setTimeout(()=>reject(new Error('Logo atau gambar surat gagal dimuat dalam waktu yang ditentukan.')),15000)
        const cleanup=()=>{
          window.clearTimeout(timer)
          image.removeEventListener('load',onLoad)
          image.removeEventListener('error',onError)
        }
        const onLoad=()=>{cleanup();resolve()}
        const onError=()=>{cleanup();reject(new Error('Logo atau gambar surat gagal dimuat.'))}
        image.addEventListener('load',onLoad,{once:true})
        image.addEventListener('error',onError,{once:true})
      })
    }
    if(image.naturalWidth===0)throw new Error('Logo atau gambar surat gagal dimuat.')
    try{await image.decode()}catch{throw new Error('Logo atau gambar surat gagal didekode untuk dicetak.')}
  }))
}

type PageBreakBoundary={element:HTMLElement;position:'before'|'after'}
function getPageBreakPositions(element:HTMLElement):('before'|'after')[]{
  const style=(element.getAttribute('style')||'').toLocaleLowerCase('en-US').replace(/\s+/g,'')
  const valueFor=(property:string)=>new RegExp(`(?:^|;)${property}:(?:always|page)(?:!important)?(?:;|$)`).test(style)
  const positions:('before'|'after')[]=[]
  const dataPosition=element.getAttribute('data-page-break')?.toLocaleLowerCase('en-US')
  if(dataPosition==='before'||valueFor('page-break-before')||valueFor('break-before'))positions.push('before')
  if(dataPosition==='after'||valueFor('page-break-after')||valueFor('break-after'))positions.push('after')
  return positions
}

function getPageBreakBoundaries(root:HTMLElement):PageBreakBoundary[]{
  return Array.from(root.querySelectorAll<HTMLElement>('*'))
    .flatMap(element=>getPageBreakPositions(element).map(position=>({element,position})))
    .sort((first,second)=>{
      const firstRange=document.createRange()
      const secondRange=document.createRange()
      if(first.position==='before')firstRange.setStartBefore(first.element)
      else firstRange.setStartAfter(first.element)
      if(second.position==='before')secondRange.setStartBefore(second.element)
      else secondRange.setStartAfter(second.element)
      firstRange.collapse(true)
      secondRange.collapse(true)
      return firstRange.compareBoundaryPoints(Range.START_TO_START,secondRange)
    })
}

function splitLetterElementAtPageBreaks(root:HTMLElement):HTMLElement[]{
  const boundaries=getPageBreakBoundaries(root)
  if(!boundaries.length)return [root.cloneNode(true) as HTMLElement]
  const documentRef=root.ownerDocument
  const pages:HTMLElement[]=[]
  let startBoundary:PageBreakBoundary|null=null
  const appendSegment=(endBoundary:PageBreakBoundary|null)=>{
    const range=documentRef.createRange()
    if(startBoundary){
      if(startBoundary.position==='before')range.setStartBefore(startBoundary.element)
      else range.setStartAfter(startBoundary.element)
    }else range.setStart(root,0)
    if(endBoundary){
      if(endBoundary.position==='before')range.setEndBefore(endBoundary.element)
      else range.setEndAfter(endBoundary.element)
    }else range.setEnd(root,root.childNodes.length)
    const fragment=range.cloneContents()
    if(!fragment.textContent?.trim()&&!fragment.querySelector('img,svg,canvas,hr,table'))return
    const page=root.cloneNode(false) as HTMLElement
    page.appendChild(fragment)
    pages.push(page)
  }
  boundaries.forEach(boundary=>{
    appendSegment(boundary)
    startBoundary=boundary
  })
  appendSegment(null)
  const watermark=root.querySelector('.letter-watermark')
  if(watermark)pages.slice(1).forEach(page=>page.prepend(watermark.cloneNode(true)))
  return pages.length?pages:[root.cloneNode(true) as HTMLElement]
}

function splitLetterHtmlAtPageBreaks(html:string):string[]{
  const root=document.createElement('div')
  root.innerHTML=html
  return splitLetterElementAtPageBreaks(root).map(page=>page.innerHTML)
}

function applyLetterPrintPageBreaks(root:ParentNode){
  root.querySelectorAll<HTMLElement>('*').forEach(element=>{
    getPageBreakPositions(element).forEach(position=>element.classList.add(`letter-page-break-${position}`))
  })
}

function requestDocumentValues(request:LetterRequest, schoolSettings:SchoolSettings|null, signatories:LetterSignatory[]) {
  const issued = Array.isArray(request.letter_issued) ? request.letter_issued[0] : request.letter_issued
  const savedPrincipalName = request.form_data?.nama_kepala_sekolah
  const savedPrincipalNip = request.form_data?.nip_kepala_sekolah
  const savedBursarName = request.form_data?.nama_bendahara
  const savedBursarNip = request.form_data?.nip_bendahara
  return {
    ...(request.form_data ?? {}),
    nama: request.requester_name,
    NIP: request.requester_nip ?? '',
    jabatan: request.requester_position ?? '',
    nama_kepala_sekolah: typeof savedPrincipalName === 'string' && savedPrincipalName.trim()
      ? savedPrincipalName : schoolOfficerTokenValue('nama_kepala_sekolah', schoolSettings, signatories),
    nip_kepala_sekolah: typeof savedPrincipalNip === 'string' && savedPrincipalNip.trim()
      ? savedPrincipalNip : schoolOfficerTokenValue('nip_kepala_sekolah', schoolSettings, signatories),
    nama_bendahara: schoolOfficerTokenValue('nama_bendahara', schoolSettings, signatories)
      || (typeof savedBursarName === 'string' ? savedBursarName : ''),
    nip_bendahara: schoolOfficerTokenValue('nip_bendahara', schoolSettings, signatories)
      || (typeof savedBursarNip === 'string' ? savedBursarNip : ''),
    nomor_surat: issued?.letter_number,
    tanggal_terbit: issued?.issue_date,
    penandatangan: issued?.signer_name,
    nip_penandatangan: issued?.signer_nip,
  }
}

function normalizePaperSize(value: unknown): PaperSize {
  return value === 'F4' ? 'F4' : 'A4'
}

function isLetterRole(value: unknown): value is LetterRole {
  return typeof value === 'string' && Object.hasOwn(roleLabels, value)
}

type RequesterIdentity = { full_name?: string | null; nip?: string | null; position?: string | null }
function isRequesterIdentity(value: unknown): value is RequesterIdentity {
  return typeof value === 'object' && value !== null
    && ('full_name' in value || 'nip' in value || 'position' in value)
}

function personFieldType(field: TemplateField): 'student' | 'teacher' | null {
  if (field.type === 'student' || field.type === 'teacher') return field.type
  const key = `${field.name} ${field.label}`.toLocaleLowerCase('id-ID')
  if (/(siswa|student|nisn)/.test(key)) return 'student'
  if (/(guru|teacher|nip|assigned_name)/.test(key)) return 'teacher'
  return null
}

const nav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { label: 'Ajukan Surat', icon: FilePlus2, key: 'create' },
  { label: 'Pengajuan Surat', icon: Files, key: 'requests' },
  { label: 'Persetujuan Surat', icon: ClipboardCheck, key: 'approvals' },
  { label: 'Surat Terbit', icon: Send, key: 'issued' },
  { label: 'Arsip Digital', icon: Archive, key: 'archive' },
  { label: 'Surat Masuk', icon: Inbox, key: 'incoming' },
  { label: 'Surat Keluar', icon: Mail, key: 'outgoing' },
  { label: 'Disposisi', icon: BookOpen, key: 'dispositions' },
  { label: 'Format Surat', icon: FileText, key: 'templates' },
]
const roleLabels: Record<LetterRole, string> = { administrator:'Administrator Super App', operator:'Operator Persuratan', guru_staf:'Guru / Tendik / Guru BK', pemohon:'Siswa', staf_tu:'Staf Tata Usaha', kepala_tu:'Kepala Tata Usaha', kepala_sekolah:'Kepala Sekolah' }
const rolePageAccess: Record<LetterRole, Page[]> = {
  administrator:nav.map(item=>item.key),
  operator:['dashboard','create','requests','issued','archive','incoming','outgoing','dispositions','templates'],
  kepala_tu:['dashboard','create','requests','approvals','issued','archive','incoming','outgoing','dispositions'],
  staf_tu:['dashboard','create','requests','archive','incoming','outgoing','dispositions'],
  kepala_sekolah:['dashboard','create','requests','approvals','issued','archive','dispositions'],
  guru_staf:['dashboard','create','requests','issued','archive'],
  pemohon:['dashboard','requests','issued','archive']
}
const statusLabels: Record<LetterStatus, string> = { draft:'Draft', submitted:'Diajukan', in_review:'Dalam Pemeriksaan', revision:'Perlu Revisi', resubmitted:'Diajukan Ulang', approved:'Disetujui', awaiting_number:'Menunggu Nomor', issued:'Diterbitkan', rejected:'Ditolak', archived:'Diarsipkan' }
const pageDescriptions: Record<Page, string> = {
  dashboard:'Ringkasan proses surat dan aktivitas terbaru sekolah.',
  create:'Mulai pengajuan baru dengan format surat yang tersedia.',
  requests:'Lacak status pengajuan dan tindak lanjuti draf.',
  approvals:'Tinjau dan berikan keputusan untuk surat yang masuk.',
  issued:'Temukan surat yang sudah memperoleh nomor resmi.',
  archive:'Dokumen surat terbit yang tersimpan sebagai arsip.',
  incoming:'Catat dan pantau surat yang diterima sekolah.',
  outgoing:'Pantau surat keluar yang dicatat melalui sistem.',
  dispositions:'Lihat tindak lanjut dan disposisi surat.',
  templates:'Kelola format yang digunakan pada pengajuan surat.'
}
export default function LettersApp({onBack,currentUser,initialStudentPrefill,onStudentPrefillHandled}: {
  onBack?: () => void;
  currentUser?: CurrentUser | null;
  initialStudentPrefill?: StudentLetterPrefill | null;
  onStudentPrefillHandled?: () => void;
}){
  const { currentUser: contextUser, schoolSettings } = useSchoolContext()
  const person = contextUser ?? currentUser ?? null
  const [session,setSession]=useState<Session | null>(null), [role,setRole]=useState<LetterRole | null>(null)
  const [page,setPage]=useState<Page>('dashboard')
  const [letterheadSlot,setLetterheadSlot]=useState<LetterheadSlot>('1')
  const [logoPosition,setLogoPosition]=useState<LogoPosition>('top')
  const [loading,setLoading]=useState(true), [sessionReady,setSessionReady]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState('')
  const [expiryClock,setExpiryClock]=useState(()=>Date.now())
  const [pdfBusy,setPdfBusy]=useState(false), [printing,setPrinting]=useState(false)
  const [requests,setRequests]=useState<LetterRequest[]>([]), [templates,setTemplates]=useState<LetterTemplate[]>([]), [incoming,setIncoming]=useState<IncomingLetter[]>([])
  const [categories,setCategories]=useState<LetterCategory[]>([])
  const [signatories,setSignatories]=useState<LetterSignatory[]>([])
  const [notifications,setNotifications]=useState<LetterNotification[]>([]), [search,setSearch]=useState(''), [toast,setToast]=useState('')
  const [modal,setModal]=useState<LetterModal>(null), [form,setForm]=useState<LetterForm>({})
  const [templateFields,setTemplateFields]=useState<TemplateField[]>([])
  const [editingTemplateId,setEditingTemplateId]=useState<string|null>(null)
  const [templateSourceFilePath,setTemplateSourceFilePath]=useState('')
  const [tokenDraft,setTokenDraft]=useState('')
  const [requestDraftId,setRequestDraftId]=useState<string|null>(null)
  const [previewRequest,setPreviewRequest]=useState<LetterRequest|null>(null)
  const [printTarget,setPrintTarget]=useState<LetterDocumentMarkup|null>(null)
  const [reviewRequest,setReviewRequest]=useState<LetterRequest|null>(null)
  const [reviewDecision,setReviewDecision]=useState<'approved'|'revision'|'rejected'>('revision')
  const [reviewNote,setReviewNote]=useState('')
  const [issueRequest,setIssueRequest]=useState<LetterRequest|null>(null)
  const [issueForm,setIssueForm]=useState<IssueForm>({letter_number:'',issue_date:new Date().toISOString().slice(0,10),signer_name:'',signer_position:'Kepala Sekolah',signer_nip:'',ktu_fields:{}})
  const [profileReady,setProfileReady]=useState(false)
  const templateHtmlRef=useRef<HTMLTextAreaElement>(null)
  const printPortalRef=useRef<HTMLDivElement>(null)
  const [selectedTemplate,setSelectedTemplate]=useState('')
  const [requestData,setRequestData]=useState<LetterForm>({})
  const [personFields,setPersonFields]=useState<Record<string,PersonOption>>({})
  const [myName,setMyName]=useState('')
  const [myNip,setMyNip]=useState('')
  const [myPosition,setMyPosition]=useState('')
  const loadRequestRef=useRef<{userId:string|null;generation:number;promise:Promise<void>|null}>({userId:null,generation:0,promise:null})
  const lastAutoRefreshAt=useRef(0)
  const loadedUserIdRef=useRef<string|null>(null)
  const cleanupAttemptedUserRef=useRef<string|null>(null)
  const isAdmin=role==='administrator'
  const canManageTemplates=isAdmin||role==='operator'
  const activeTemplates=templates.filter(template=>template.is_active!==false)
  const rolePermissionError=/permission denied for table\s+letter_user_roles/i.test(error)
  const sessionRateLimitError=/\b429\b|rate limit|membatasi pembaruan sesi/i.test(error)
  const roleSourceMigrationError=/letter_current_role|could not find the function/i.test(error)
  const visibleNav=role ? nav.filter((item)=>rolePageAccess[role].includes(item.key)) : []

  useEffect(()=>{
    if(!initialStudentPrefill||loading||error)return
    const timerId=window.setTimeout(()=>{
      if(!initialStudentPrefill)return
      const template=templates.find(item=>/panggilan/i.test(item.name))
      const subject=`Surat Panggilan Orang Tua/Wali - ${initialStudentPrefill.full_name}`
      setPage('create')
      setForm(previous=>({...previous,subject}))
      if(!template){
        setSelectedTemplate('')
        setRequestData({})
        setPersonFields({})
        setToast('Format Surat Panggilan belum tersedia. Hubungi Operator Persuratan agar template dapat digunakan.')
        window.setTimeout(()=>setToast(''),5000)
        onStudentPrefillHandled?.()
        return
      }
      const studentOption:PersonOption={
        id:initialStudentPrefill.id,
        type:'student',
        full_name:initialStudentPrefill.full_name,
        identifier:initialStudentPrefill.nisn,
        class_id:initialStudentPrefill.class_id,
        class_name:initialStudentPrefill.class_name,
        profile_id:null
      }
      const data:LetterForm={}
      const people:Record<string,PersonOption>={}
      for(const field of template.fields_schema){
        const fieldKey=`${field.name} ${field.label}`.toLocaleLowerCase('id-ID')
        if(personFieldType(field)==='student'){
          people[field.name]=studentOption
          data[field.name]=studentOption.full_name
          data[`${field.name}_id`]=studentOption.id
          data[`${field.name}_identifier`]=studentOption.identifier
          data[`${field.name}_class_name`]=studentOption.class_name||''
        }else if(/kelas|class/.test(fieldKey)){
          data[field.name]=studentOption.class_name||''
        }else if(/alasan|keperluan|tujuan|perihal|keterangan|agenda|topik/.test(fieldKey)){
          data[field.name]=initialStudentPrefill.context
        }else if(/tanggal|hari/.test(fieldKey)){
          data[field.name]=new Date().toISOString().slice(0,10)
        }
      }
      setSelectedTemplate(template.id)
      setRequestData(data)
      setPersonFields(people)
      setToast('Data siswa dan konteks BK sudah diisi otomatis. Tinjau lalu simpan sebagai draft.')
      window.setTimeout(()=>setToast(''),5000)
      onStudentPrefillHandled?.()
    },0)
    return ()=>window.clearTimeout(timerId)
  },[error,initialStudentPrefill,loading,onStudentPrefillHandled,templates])

  const acceptSession=useCallback((nextSession:Session|null)=>{
    const nextUserId=nextSession?.user.id??null
    if(loadedUserIdRef.current!==nextUserId){
      loadedUserIdRef.current=nextUserId
      loadRequestRef.current={userId:nextUserId,generation:loadRequestRef.current.generation+1,promise:null}
      setRole(null);setRequests([]);setTemplates([]);setCategories([]);setSignatories([]);setIncoming([]);setNotifications([]);setError('')
      setProfileReady(false)
      setLoading(Boolean(nextUserId))
    }
    setSession(current=>current?.user.id===nextUserId?current:nextSession)
  },[])

  const loadAll=useCallback(async(silent=false):Promise<void>=>{
    const uid=session?.user.id
    if(!uid)return
    lastAutoRefreshAt.current=Date.now()
    const currentRequest=loadRequestRef.current
    if(currentRequest.userId===uid&&currentRequest.promise)return currentRequest.promise
    const generation=currentRequest.generation+1
    loadRequestRef.current={userId:uid,generation,promise:null}
    if(!silent){setLoading(true);setError('')}
    const request=(async()=>{
      const cleanupKey=`persuratan:cleanup-expired:${uid}`
      let cleanupAlreadyAttempted=cleanupAttemptedUserRef.current===uid
      try{
        cleanupAlreadyAttempted=cleanupAlreadyAttempted||sessionStorage.getItem(cleanupKey)==='1'
      }catch(storageError){
        console.warn('Status pembersihan pengajuan surat tidak dapat dibaca dari penyimpanan sesi:',storageError)
      }
      if(!cleanupAlreadyAttempted){
        cleanupAttemptedUserRef.current=uid
        try{sessionStorage.setItem(cleanupKey,'1')}catch(storageError){
          console.warn('Status pembersihan pengajuan surat tidak dapat disimpan di penyimpanan sesi:',storageError)
        }
        const {error:cleanupError}=await supabase.rpc('cleanup_expired_letter_requests')
        if(cleanupError)console.warn('Pembersihan pengajuan surat kadaluarsa tidak tersedia:',cleanupError.message)
      }
      const {data:roleData,error:roleErr}=await supabase.rpc('letter_current_role')
      const requestRole=!roleErr&&isLetterRole(roleData)?roleData:null
      let requestsQuery=supabase.from('letter_requests')
        .select('*, letter_templates(name, category_id, requires_principal_approval, requires_number, html_content, fields_schema, page_settings), letter_issued(letter_number,issue_date,signer_name,signer_position,signer_nip,html_snapshot), letter_approvals(approver_role,decision)')
        .order('created_at',{ascending:false})
      if(!requestRole||!GLOBAL_REQUEST_ROLES.has(requestRole))requestsQuery=requestsQuery.eq('requester_id',uid)
      const [{data:reqData,error:reqErr},{data:tplData,error:tplErr},{data:inData,error:inErr},{data:notifData,error:notifErr},{data:categoryData,error:categoryErr},{data:identityData,error:identityErr},{data:signatoryData,error:signatoryErr}] = await Promise.all([
        requestsQuery,
        supabase.from('letter_templates').select('*, letter_categories(name,code)').order('name'),
        supabase.from('letter_incoming').select('*').order('received_date',{ascending:false}),
        supabase.from('letter_notifications').select('*').order('created_at',{ascending:false}).limit(30),
        supabase.from('letter_categories').select('id,name,code').eq('is_active',true).order('name'),
        supabase.rpc('letter_requester_identity').maybeSingle(),
        supabase.rpc('letter_get_signatories')
      ])
      if(loadRequestRef.current.generation!==generation)return
      const loadError=roleErr||reqErr||tplErr||inErr||notifErr||categoryErr||identityErr||signatoryErr
      setError(loadError?(isSupabaseRateLimitError(loadError)?`HTTP 429: ${loadError.message}`:loadError.message):'')
      if(!roleErr)setRole(isLetterRole(roleData)?roleData:null)
      if(!reqErr)setRequests(reqData||[])
      if(!tplErr)setTemplates((tplData||[]).map((t: LetterTemplate & {letter_categories?:LetterTemplate['category']})=>({
        ...t,
        category:t.letter_categories,
        fields_schema:Array.isArray(t.fields_schema)?t.fields_schema.map(normalizeTemplateField):[],
      })))
      if(!inErr)setIncoming(inData||[])
      if(!notifErr)setNotifications(notifData||[])
      if(!categoryErr)setCategories(categoryData??[])
      if(!identityErr){
        const identity=isRequesterIdentity(identityData)?identityData:null
        setMyName(identity?.full_name||person?.full_name||currentUser?.username||'')
        setMyNip(identity?.nip||person?.nip_or_nisn||currentUser?.username||'')
        setMyPosition(identity?.position||person?.jabatan||person?.class_name||'')
        setProfileReady(true)
      }
      if(!signatoryErr)setSignatories(signatoryData??[])
    })()
    loadRequestRef.current.promise=request
    try{
      await request
    }catch(loadError){
      if(!isSupabaseRateLimitError(loadError))console.error('Data Persuratan gagal dimuat:',loadError)
      if(loadRequestRef.current.generation===generation)setError(isSupabaseRateLimitError(loadError)?`HTTP 429: ${loadError instanceof Error?loadError.message:String(loadError)}`:loadError instanceof Error?loadError.message:String(loadError))
    }finally{
      if(loadRequestRef.current.generation===generation){
        loadRequestRef.current.promise=null
        setLoading(false)
      }
    }
  },[currentUser?.username,person?.full_name,person?.nip_or_nisn,person?.jabatan,person?.class_name,session?.user.id])

  useEffect(()=>{
    let active=true
    getValidSupabaseSession().then((session)=>{
      if(!active)return
      acceptSession(session)
      setSessionReady(true)
    }).catch(sessionError=>{
      if(!active)return
      setError(sessionError instanceof Error?sessionError.message:String(sessionError))
      setSessionReady(true)
    })
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{
      if(active)acceptSession(s)
    })
    return ()=>{active=false;subscription.unsubscribe()}
  },[acceptSession])
  const sessionUserId=session?.user.id??null
  useEffect(()=>{
    if(!sessionUserId)return
    const timerId=window.setTimeout(()=>void loadAll(Boolean(role)),0)
    return ()=>window.clearTimeout(timerId)
  },[sessionUserId,role,loadAll])
  useEffect(()=>{
    if(!sessionUserId)return
    const refreshVisibleData=()=>{
      if(document.visibilityState==='visible'&&Date.now()-lastAutoRefreshAt.current>=120_000){
        lastAutoRefreshAt.current=Date.now()
        void loadAll(true)
      }
    }
    const intervalId=window.setInterval(refreshVisibleData,5*60_000)
    document.addEventListener('visibilitychange',refreshVisibleData)
    return ()=>{
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange',refreshVisibleData)
    }
  },[sessionUserId,loadAll])
  useEffect(()=>{
    const intervalId=window.setInterval(()=>setExpiryClock(Date.now()),60_000)
    return ()=>window.clearInterval(intervalId)
  },[])
  useEffect(()=>{
    if(!sessionUserId)return
    const channel=supabase.channel(`letter-notifications-${sessionUserId}`)
      .on('postgres_changes',{
        event:'INSERT',
        schema:'public',
        table:'letter_notifications',
        filter:`user_id=eq.${sessionUserId}`,
      },payload=>{
        const row=payload.new as Partial<LetterNotification>
        if(typeof row.id!=='string'||typeof row.title!=='string'||typeof row.body!=='string'||typeof row.created_at!=='string'||typeof row.is_read!=='boolean')return
        const notification:LetterNotification={
          id:row.id,title:row.title,body:row.body,created_at:row.created_at,is_read:row.is_read,
          letter_request_id:typeof row.letter_request_id==='string'?row.letter_request_id:null,
        }
        setNotifications(previous=>[notification,...previous.filter(item=>item.id!==notification.id)].slice(0,30))
      })
      .subscribe()
    return ()=>{void supabase.removeChannel(channel)}
  },[sessionUserId])
  function notify(msg:string){setToast(msg);setTimeout(()=>setToast(''),3200)}
  async function markNotificationRead(notification:LetterNotification){
    if(notification.is_read)return
    const {error}=await supabase.from('letter_notifications').update({is_read:true}).eq('id',notification.id)
    if(error){notify(`Notifikasi gagal diperbarui: ${error.message}`);return}
    setNotifications(previous=>previous.map(item=>item.id===notification.id?{...item,is_read:true}:item))
  }
  async function auditLetter(action:string,details:string){
    try{
      await logAppActivity({actorId:currentUser?.id,actorLabel:currentUser?.full_name||currentUser?.username,action,moduleKey:'Persuratan',details})
    }catch(error){
      notify(`Perubahan tersimpan, tetapi audit aktivitas gagal: ${error instanceof Error?error.message:String(error)}`)
    }
  }
  async function createRequest(e:FormEvent<HTMLFormElement>){
    e.preventDefault()
    if(role==='pemohon'){notify('Akun siswa tidak dapat mengajukan surat.');return}
    if(!session){notify('Sesi login tidak tersedia. Masuk kembali untuk melanjutkan.');return}
    if(!profileReady||!myName.trim()){notify('Identitas akun belum tersedia. Muat ulang data sebelum mengajukan surat.');return}
    const template=activeTemplates.find(item=>item.id===selectedTemplate)
      ||(requestDraftId?templates.find(item=>item.id===selectedTemplate):undefined)
    if(!template){notify('Pilih format surat aktif dari database.');return}
    const editingRequest=requestDraftId?requests.find(request=>request.id===requestDraftId):undefined

    setBusy(true)
    const payload={
      template_id:template.id,
      requester_id:session.user.id,
      requester_name:myName.trim(),
      requester_nip:myNip.trim()||null,
      requester_position:myPosition.trim()||null,
      subject:form.subject?.trim()||template.subject||template.name,
      form_data:requestData,
      status:editingRequest?.status==='revision'?'revision':'draft',
    }
    const result=requestDraftId
      ? await supabase.from('letter_requests').update(payload).eq('id',requestDraftId).eq('requester_id',session.user.id).select('id').single()
      : await supabase.from('letter_requests').insert(payload).select('id').single()
    if(result.error){
      notify(result.error.message)
      setBusy(false)
      return
    }
    const requestId=result.data.id
    if((e.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement
      && (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='submit'){
      const {error:submitError}=await supabase.rpc('letter_submit_request',{p_request_id:requestId})
      if(submitError){
        notify(`Draft tersimpan, tetapi pengiriman gagal: ${submitError.message}`)
        await loadAll(true)
        setBusy(false)
        return
      }
      await auditLetter('Pengajuan surat dikirim',`${myName} · ${payload.subject}`)
      notify('Pengajuan berhasil dikirim ke Kepala TU')
    }else{
      await auditLetter('Draft pengajuan disimpan',`${myName} · ${payload.subject}`)
      notify('Draft pengajuan berhasil disimpan')
    }
    setRequestDraftId(null)
    setPage('requests')
    await loadAll(true)
    setBusy(false)
  }
  async function submitRequest(id:string){
    if(role==='pemohon'){notify('Akun siswa tidak dapat mengajukan surat.');return}
    setBusy(true);const {error}=await supabase.rpc('letter_submit_request',{p_request_id:id})
    if(error)notify(error.message);else{await auditLetter('Pengajuan surat dikirim',`Pengajuan ${id} dikirim untuk diperiksa.`);notify('Pengajuan berhasil dikirim ke Kepala TU');await loadAll(true)}
    setBusy(false)
  }
  function review(request:LetterRequest){
    setReviewRequest(request)
    setReviewDecision('revision')
    setReviewNote('')
    setPreviewRequest(request)
    setModal({type:'review'})
  }
  async function submitReview(e:FormEvent<HTMLFormElement>){
    e.preventDefault()
    if(!reviewRequest)return
    if(reviewDecision!=='approved'&&!reviewNote.trim()){notify('Catatan wajib diisi untuk revisi atau penolakan.');return}
    setBusy(true)
    const {error}=await supabase.rpc('letter_review_request',{
      p_request_id:reviewRequest.id,
      p_decision:reviewDecision,
      p_note:reviewNote.trim()||null,
    })
    if(error)notify(error.message)
    else{
      await auditLetter(`Pengajuan surat ${reviewDecision}`,`Pengajuan ${reviewRequest.request_code} · ${reviewNote||'Tanpa catatan'}`)
      notify('Keputusan berhasil disimpan')
      setModal(null)
      await loadAll(true)
    }
    setBusy(false)
  }
  function openIssue(request:LetterRequest){
    const year=new Date().getFullYear()
    const defaultSigner=findPrincipal(signatories)
    const requestTemplate=templates.find(template=>template.id===request.template_id)
    const ktuFields=(requestTemplate?.fields_schema||request.letter_templates?.fields_schema||[])
      .filter(field=>TU_COMPLETABLE_TOKEN_NAMES.has(field.name.toLocaleLowerCase('id-ID')))
    const ktuValues=Object.fromEntries(ktuFields.map(field=>[
      field.name,
      String(request.form_data?.[field.name]??''),
    ]))
    setIssueRequest(request)
    setIssueForm({
      letter_number:`421.03/001/UPT.SMA.07/MRS/DISDIK/${year}`,
      issue_date:new Date().toISOString().slice(0,10),
      signer_name:defaultSigner?.full_name||schoolProfileTokenValue('nama_kepala_sekolah',schoolSettings),
      signer_position:defaultSigner?.employment_status||'Kepala Sekolah',
      signer_nip:defaultSigner?.nip||schoolProfileTokenValue('nip_kepala_sekolah',schoolSettings),
      ktu_fields:ktuValues,
    })
    setPreviewRequest(request)
    setModal({type:'issue'})
  }
  async function submitIssue(e:FormEvent<HTMLFormElement>){
    e.preventDefault()
    if(!issueRequest)return
    setBusy(true)
    const {error}=await supabase.rpc('letter_issue_number_with_ktu_fields',{
      p_request_id:issueRequest.id,
      p_letter_number:issueForm.letter_number.trim(),
      p_issue_date:issueForm.issue_date,
      p_signer_name:issueForm.signer_name.trim(),
      p_signer_position:issueForm.signer_position.trim(),
      p_signer_nip:issueForm.signer_nip.trim()||null,
      p_ktu_fields:issueForm.ktu_fields,
    })
    if(error)notify(error.message)
    else{
      await auditLetter('Nomor surat diterbitkan',`${issueRequest.request_code} · ${issueForm.letter_number}`)
      notify('Nomor surat berhasil diterbitkan dan masuk arsip')
      setModal(null)
      await loadAll(true)
    }
    setBusy(false)
  }
  function openNewTemplate(){
    setEditingTemplateId(null)
    setTemplateSourceFilePath('')
    setLogoPosition('top')
    setTemplateFields([])
    setTokenDraft('')
    setForm({
      name:'',
      description:'',
      category_id:'',
      subject:'',
      html_content:'<p>Nomor: {nomor_surat}<br>Lampiran: {lampiran}<br>Hal: {perihal}</p><p>Kepada Yth.<br>{tujuan}</p><p>Dengan hormat,</p><p>{isi_surat}</p>',
      paper_size:'A4',
      requires_principal_approval:'false',
      requires_number:'true',
      is_active:'true',
    })
    setTemplateFields(detectTemplateFields('<p>{nomor_surat} {lampiran} {perihal} {tujuan} {isi_surat}</p>'))
    setModal({type:'template'})
  }
  function editTemplate(template:LetterTemplate){
    setEditingTemplateId(template.id)
    setTemplateSourceFilePath(template.source_file_path||'')
    setLogoPosition(template.page_settings?.logo_position||'top')
    setTemplateFields(template.fields_schema||[])
    setForm({
      name:template.name,
      description:template.description||'',
      category_id:template.category_id||categories.find(category=>category.code===template.category?.code)?.id||'',
      subject:template.subject||'',
      html_content:template.html_content||'',
      paper_size:normalizePaperSize(template.page_settings?.size),
      requires_principal_approval:String(Boolean(template.requires_principal_approval)),
      requires_number:String(template.requires_number!==false),
      is_active:String(template.is_active!==false),
    })
    setModal({type:'template'})
  }
  function duplicateTemplate(template:LetterTemplate){
    editTemplate(template)
    setEditingTemplateId(null)
    setForm(previous=>({...previous,name:`${template.name} (Salinan)`,is_active:'true'}))
  }
  async function deactivateTemplate(template:LetterTemplate){
    const {error}=await supabase.from('letter_templates').update({is_active:false,updated_by:session?.user.id}).eq('id',template.id)
    if(error)notify(error.message)
    else{notify('Template dinonaktifkan');await loadAll(true)}
  }
  async function activateTemplate(template:LetterTemplate){
    const {error}=await supabase.from('letter_templates').update({is_active:true,updated_by:session?.user.id}).eq('id',template.id)
    if(error)notify(error.message)
    else{notify('Template diaktifkan kembali');await loadAll(true)}
  }
  async function createTemplate(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true)
    if(!session){notify('Sesi login tidak tersedia. Masuk kembali untuk melanjutkan.');setBusy(false);return}
    if(!canManageTemplates){notify('Hanya Administrator atau Operator yang dapat mengelola format surat.');setBusy(false);return}
    const html=String(form.html_content||'').trim()
    if(!html){notify('Isi format surat wajib diisi.');setBusy(false);return}
    const fields=detectTemplateFields(html,templateFields)
    const payload={
      name:String(form.name||'').trim(),
      description:String(form.description||'').trim()||null,
      category_id:String(form.category_id||'')||null,
      subject:String(form.subject||'').trim()||String(form.name||'').trim(),
      html_content:sanitizeTemplateHtml(html),
      page_settings:{size:normalizePaperSize(form.paper_size),margin_mm:22,logo_position:logoPosition},
      fields_schema:fields,
      requires_principal_approval:form.requires_principal_approval==='true',
      requires_number:form.requires_number!=='false',
      is_active:form.is_active!=='false',
      source_file_path:templateSourceFilePath||null,
      updated_by:session.user.id,
    }
    const result=editingTemplateId
      ? await supabase.from('letter_templates').update(payload).eq('id',editingTemplateId)
      : await supabase.from('letter_templates').insert({...payload,created_by:session.user.id})
    if(result.error)notify(result.error.message)
    else{
      notify(editingTemplateId?'Template diperbarui':'Template berhasil dibuat')
      setModal(null);setForm({});setEditingTemplateId(null);setTemplateFields([])
      await loadAll(true)
    }
    setBusy(false)
  }
  async function importTemplateFile(file:File|null){
    if(!file)return
    if(!session){notify('Sesi login tidak tersedia. Masuk kembali untuk melanjutkan.');return}
    if(!canManageTemplates){notify('Hanya Administrator atau Operator yang dapat mengunggah format surat.');return}
    const extension=file.name.split('.').pop()?.toLocaleLowerCase('en-US')
    if(extension!=='docx'&&extension!=='pdf'){notify('Pilih file .docx atau .pdf.');return}
    if(file.size>15*1024*1024){notify('Ukuran file maksimal 15 MB.');return}
    setBusy(true)
    try{
      let html=''
      if(extension==='docx'){
        const mammoth=await import('mammoth')
        const converted=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()})
        html=converted.value
      }else{
        const [pdfjsLib,pdfWorker]=await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ])
        pdfjsLib.GlobalWorkerOptions.workerSrc=pdfWorker.default
        const document=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise
        const paragraphs:string[]=[]
        for(let pageNumber=1;pageNumber<=document.numPages;pageNumber+=1){
          const page=await document.getPage(pageNumber)
          const content=await page.getTextContent()
          const lines=new Map<number,Array<{x:number;text:string}>>()
          for(const item of content.items){
            if(!('str' in item)||!item.str.trim())continue
            const y=Math.round(item.transform[5])
            const line=lines.get(y)??[]
            line.push({x:item.transform[4],text:item.str})
            lines.set(y,line)
          }
          paragraphs.push(...[...lines.entries()]
            .sort(([first],[second])=>second-first)
            .map(([,line])=>`<p>${escapeHtml(line.sort((first,second)=>first.x-second.x).map(item=>item.text).join(' ').trim())}</p>`))
        }
        html=paragraphs.join('')
        if(!html.trim())throw new Error('PDF tidak memiliki teks yang dapat diekstrak. Gunakan PDF berbasis teks atau unggah file DOCX.')
      }
      if(!html.trim())throw new Error('Isi dokumen tidak dapat dibaca.')
      const fileName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_')
      const filePath=`${session.user.id}/templates/${Date.now()}-${fileName}`
      const {error:uploadError}=await supabase.storage.from('letter-files').upload(filePath,file,{
        contentType:extension==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert:false,
      })
      if(uploadError)throw uploadError
      setTemplateSourceFilePath(filePath)
      setForm(previous=>({...previous,html_content:html}))
      setTemplateFields(detectTemplateFields(html,templateFields))
      notify(`Dokumen ${extension.toUpperCase()} berhasil dibaca. Periksa pratinjau dan skema variabel.`)
    }catch(error){
      notify(`Dokumen gagal diimpor: ${error instanceof Error?error.message:String(error)}`)
    }finally{
      setBusy(false)
    }
  }
  async function createIncoming(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true)
    if(!session){notify('Sesi login tidak tersedia. Masuk kembali untuk melanjutkan.');setBusy(false);return}
    const {error}=await supabase.from('letter_incoming').insert({...form,created_by:session.user.id})
    if(error)notify(error.message);else{notify('Surat masuk berhasil dicatat');setModal(null);setForm({});await loadAll(true)}
    setBusy(false)
  }
  async function markRequestDownloaded(request:LetterRequest):Promise<boolean>{
    if(!session||request.requester_id!==session.user.id||!isRequestExpiryEligible(request)||request.downloaded_at)return true
    const {data,error}=await supabase.rpc('letter_mark_request_downloaded',{p_request_id:request.id})
    if(error){notify(`Status unduhan gagal dicatat: ${error.message}`);return false}
    const downloadedAt=typeof data==='string'?data:new Date().toISOString()
    setRequests(previous=>previous.map(item=>item.id===request.id?{...item,downloaded_at:downloadedAt}:item))
    setPreviewRequest(previous=>previous?.id===request.id?{...previous,downloaded_at:downloadedAt}:previous)
    return true
  }
  const getRequestTemplate=(request:LetterRequest):LetterDocumentMarkup|null=>{
    const activeTemplate=templates.find(template=>template.id===request.template_id)
    const issued=Array.isArray(request.letter_issued)?request.letter_issued[0]:request.letter_issued
    const html=activeTemplate?.html_content||request.letter_templates?.html_content||issued?.html_snapshot||''
    const fields=activeTemplate?.fields_schema||request.letter_templates?.fields_schema||[]
    if(!html)return null
    return {
      html:renderTemplateContent(html,requestDocumentValues(request,schoolSettings,signatories),fields),
      header:makeLetterheadHtml(schoolSettings,letterheadSlot,activeTemplate?.page_settings?.logo_position||request.letter_templates?.page_settings?.logo_position||'top'),
      paperSize:normalizePaperSize(activeTemplate?.page_settings?.size||request.letter_templates?.page_settings?.size),
      isDraft:!isRequestExpiryEligible(request),
      title:request.subject,
    }
  }
  const openPreview=(request:LetterRequest)=>{setPreviewRequest(request);setModal({type:'preview'})}
  const printLetter=(request:LetterRequest)=>{
    if(printing||pdfBusy)return
    const documentMarkup=getRequestTemplate(request)
    if(!documentMarkup){notify('Konten template surat tidak tersedia untuk pratinjau.');return}
    setPrinting(true)
    setPrintTarget(documentMarkup)
    void markRequestDownloaded(request).then(downloadTracked=>{
      if(!downloadTracked)notify('Surat akan dicetak, tetapi status unduhan gagal dicatat.')
    })
  }
  useEffect(()=>{
    if(!printTarget)return
    let cancelled=false
    let finished=false
    let cleanupTimer=0
    const cleanup=()=>{
      if(finished)return
      finished=true
      if(cleanupTimer)window.clearTimeout(cleanupTimer)
      window.removeEventListener('afterprint',cleanup)
      setPrintTarget(null)
      setPrinting(false)
    }
    const prepareAndPrint=async()=>{
      try{
        const portal=printPortalRef.current
        const content=portal?.querySelector<HTMLElement>('.letter-print-content')
        if(!portal||!content)throw new Error('Area dokumen cetak tidak tersedia.')
        applyLetterPrintPageBreaks(content)
        await waitForPrintImages(portal)
        await document.fonts.ready
        if(!content.textContent?.trim())throw new Error('Isi surat untuk dicetak kosong.')
        await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))
        await new Promise<void>(resolve=>window.setTimeout(resolve,150))
        if(cancelled)return
        window.addEventListener('afterprint',cleanup,{once:true})
        cleanupTimer=window.setTimeout(cleanup,60000)
        window.print()
      }catch(printError){
        if(cancelled)return
        cleanup()
        setToast(`Gagal menyiapkan cetak: ${printError instanceof Error?printError.message:'Terjadi kesalahan yang tidak diketahui.'}`)
        window.setTimeout(()=>setToast(''),3200)
      }
    }
    void prepareAndPrint()
    return ()=>{
      cancelled=true
      if(cleanupTimer)window.clearTimeout(cleanupTimer)
      window.removeEventListener('afterprint',cleanup)
    }
  },[printTarget])
  const handlePrintLetter=()=>{
    if(previewRequest)printLetter(previewRequest)
  }
  const downloadLetterPdf=async(request:LetterRequest)=>{
    if(pdfBusy)return
    const documentMarkup=getRequestTemplate(request)
    if(!documentMarkup){notify('Konten template surat tidak tersedia untuk dibuat menjadi PDF.');return}
    setPdfBusy(true)
    let renderHost:HTMLDivElement|null=null
    try{
      const [{default:html2canvas},{default:JsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')])
      const pageWidth=documentMarkup.paperSize==='F4'?215:210
      const pageHeight=documentMarkup.paperSize==='F4'?330:297
      renderHost=document.createElement('div')
      renderHost.className='letter-app'
      Object.assign(renderHost.style,{
        position:'fixed',left:'-10000px',top:'0',width:`${pageWidth}mm`,zIndex:'-1',
        pointerEvents:'none',background:'#fff',
      })
      const paper=document.createElement('div')
      paper.className=`letter-paper${documentMarkup.paperSize==='F4'?' paper-f4':''}`
      Object.assign(paper.style,{
        width:`${pageWidth}mm`,height:'auto',minHeight:`${pageHeight}mm`,maxWidth:'none',
        margin:'0',padding:'18mm 17mm',boxShadow:'none',overflow:'visible',
      })
      if(documentMarkup.isDraft){
        const watermark=document.createElement('span')
        watermark.className='letter-watermark'
        watermark.textContent='KONSEP / BELUM BERNOMOR'
        paper.appendChild(watermark)
      }
      const content=document.createElement('div')
      content.className='letter-document-render letter-paper-preview'
      content.innerHTML=`${documentMarkup.header}<article class="letter-template-body">${documentMarkup.html}</article>`
      paper.appendChild(content)
      renderHost.appendChild(paper)
      document.body.appendChild(renderHost)
      const pageElements=splitLetterElementAtPageBreaks(paper)
      paper.remove()
      if(!pageElements.length)throw new Error('Tidak ada halaman surat yang dapat dibuat menjadi PDF.')
      const pdf=new JsPDF({orientation:'portrait',unit:'mm',format:[pageWidth,pageHeight],compress:true})
      let pdfHasPageContent=false
      for(const page of pageElements){
        renderHost.appendChild(page)
        const images=Array.from(page.querySelectorAll('img'))
        await Promise.all(images.map(async image=>{
          const source=image.getAttribute('src')
          if(!source){image.remove();return}
          const resolvedUrl=new URL(source,window.location.href)
          if(resolvedUrl.origin!==window.location.origin&&resolvedUrl.protocol!=='data:'&&resolvedUrl.protocol!=='blob:'){
            image.crossOrigin='anonymous'
            image.src=resolvedUrl.href
          }
          try{
            await image.decode()
          }catch{
            throw new Error('Logo atau gambar surat gagal dimuat. Periksa URL dan izin akses gambar.')
          }
        }))
        await document.fonts.ready
        await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))
        const canvas=await html2canvas(page,{
          scale:2,useCORS:true,allowTaint:false,backgroundColor:'#ffffff',logging:false,
          width:page.offsetWidth,height:page.scrollHeight,windowWidth:page.offsetWidth,
          windowHeight:page.scrollHeight,scrollX:0,scrollY:0,
        })
        if(!canvas.width||!canvas.height)throw new Error('Lembar surat kosong dan tidak dapat dirender.')
        const mmPerPixel=pageWidth/canvas.width
        const pageImageHeight=canvas.height*mmPerPixel
        if(pageImageHeight<=pageHeight+0.5){
          if(pdfHasPageContent)pdf.addPage()
          const fitScale=Math.min(pageWidth/canvas.width,pageHeight/canvas.height)
          const imageWidth=canvas.width*fitScale
          const imageHeight=canvas.height*fitScale
          pdf.addImage(canvas.toDataURL('image/png'),'PNG',(pageWidth-imageWidth)/2,0,imageWidth,imageHeight,undefined,'FAST')
          pdfHasPageContent=true
          continue
        }
        const pixelsPerPage=Math.max(1,Math.floor(pageHeight/mmPerPixel))
        for(let top=0;top<canvas.height;top+=pixelsPerPage){
          const slice=document.createElement('canvas')
          slice.width=canvas.width
          slice.height=Math.min(pixelsPerPage,canvas.height-top)
          const context=slice.getContext('2d')
          if(!context)throw new Error('Canvas halaman PDF tidak dapat diproses.')
          context.drawImage(canvas,0,top,canvas.width,slice.height,0,0,canvas.width,slice.height)
          if(pdfHasPageContent)pdf.addPage()
          pdf.addImage(slice.toDataURL('image/png'),'PNG',0,0,pageWidth,slice.height*mmPerPixel,undefined,'FAST')
          pdfHasPageContent=true
        }
      }
      const issued=Array.isArray(request.letter_issued)?request.letter_issued[0]:request.letter_issued
      const fileBase=`${documentMarkup.title}_${issued?.letter_number||request.request_code}`
        .replace(/[^a-zA-Z0-9._-]+/g,'_')
        .replace(/_+/g,'_')
        .replace(/^[_.]+|[_.]+$/g,'')||'Surat'
      pdf.save(`${fileBase}.pdf`)
      const downloadTracked=await markRequestDownloaded(request)
      notify(downloadTracked?'PDF surat berhasil diunduh.':'PDF berhasil diunduh, tetapi status unduhan gagal dicatat.')
    }catch(pdfError){
      notify(`PDF gagal dibuat: ${pdfError instanceof Error?pdfError.message:'Terjadi kesalahan yang tidak diketahui.'}`)
    }finally{
      renderHost?.remove()
      setPdfBusy(false)
    }
  }
  function editRequest(request:LetterRequest){
    if(role==='pemohon'||!['draft','revision'].includes(request.status)||request.requester_id!==session?.user.id)return
    const template=templates.find(item=>item.id===request.template_id)
    if(!template){notify('Format surat untuk pengajuan ini tidak lagi tersedia.');return}
    setRequestDraftId(request.id)
    setSelectedTemplate(template.id)
    setForm({subject:request.subject})
    setRequestData({
      ...request.form_data as Record<string,string>,
      nama:myName,
      NIP:myNip,
      jabatan:myPosition,
      nama_kepala_sekolah:typeof request.form_data?.nama_kepala_sekolah==='string'&&request.form_data.nama_kepala_sekolah.trim()
        ?request.form_data.nama_kepala_sekolah:schoolOfficerTokenValue('nama_kepala_sekolah',schoolSettings,signatories),
      nip_kepala_sekolah:typeof request.form_data?.nip_kepala_sekolah==='string'&&request.form_data.nip_kepala_sekolah.trim()
        ?request.form_data.nip_kepala_sekolah:schoolOfficerTokenValue('nip_kepala_sekolah',schoolSettings,signatories),
      nama_bendahara:schoolOfficerTokenValue('nama_bendahara',schoolSettings,signatories)||String(request.form_data?.nama_bendahara||''),
      nip_bendahara:schoolOfficerTokenValue('nip_bendahara',schoolSettings,signatories)||String(request.form_data?.nip_bendahara||''),
    })
    setPersonFields({})
    setPage('create')
  }
  const visibleRequests=useMemo(()=>requests.filter((r)=>{
    const q=search.toLowerCase()
    return !q||[r.request_code,r.subject,r.requester_name,r.status].some(v=>String(v||'').toLowerCase().includes(q))
  }),[requests,search])
  const ownRequests=useMemo(()=>requests.filter(request=>request.requester_id===session?.user.id),[requests,session?.user.id])
  const ownVisibleRequests=useMemo(()=>visibleRequests.filter(request=>request.requester_id===sessionUserId),[sessionUserId,visibleRequests])
  const selectedTemplateRecord=templates.find(template=>template.id===selectedTemplate)
  const issueTemplate=issueRequest?templates.find(template=>template.id===issueRequest.template_id):undefined
  const issueEditableFields=(issueTemplate?.fields_schema||issueRequest?.letter_templates?.fields_schema||[])
    .filter(field=>TU_COMPLETABLE_TOKEN_NAMES.has(field.name.toLocaleLowerCase('id-ID')))
  const liveFormValues={
    ...requestData,
    nama:myName,
    NIP:myNip,
    jabatan:myPosition,
    nama_kepala_sekolah:schoolOfficerTokenValue('nama_kepala_sekolah',schoolSettings,signatories)||requestData.nama_kepala_sekolah||'',
    nip_kepala_sekolah:schoolOfficerTokenValue('nip_kepala_sekolah',schoolSettings,signatories)||requestData.nip_kepala_sekolah||'',
    nama_bendahara:schoolOfficerTokenValue('nama_bendahara',schoolSettings,signatories)||requestData.nama_bendahara||'',
    nip_bendahara:schoolOfficerTokenValue('nip_bendahara',schoolSettings,signatories)||requestData.nip_bendahara||'',
  }
  const livePreviewHtml=selectedTemplateRecord
    ?renderTemplateContent(selectedTemplateRecord.html_content||'',liveFormValues,selectedTemplateRecord.fields_schema)
    :''
  const previewDocument=previewRequest?getRequestTemplate(previewRequest):null
  function insertTemplateToken(name:string){
    const editor=templateHtmlRef.current
    const current=String(form.html_content||'')
    const start=editor?.selectionStart??current.length
    const end=editor?.selectionEnd??start
    const replacement=`{${name}}`
    const next=`${current.slice(0,start)}${replacement}${current.slice(end)}`
    setForm(previous=>({...previous,html_content:next}))
    setTemplateFields(detectTemplateFields(next,templateFields))
    window.requestAnimationFrame(()=>{
      editor?.focus()
      editor?.setSelectionRange(start+replacement.length,start+replacement.length)
    })
  }
  function updateTemplateField(index:number,changes:Partial<TemplateField>){
    setTemplateFields(previous=>previous.map((field,fieldIndex)=>fieldIndex===index?{...field,...changes}:field))
  }
  const renderTemplateField=(field:TemplateField)=>{
    const normalized=field.name.toLocaleLowerCase('id-ID')
    if(BURSAR_TOKEN_NAMES.has(normalized)){
      const bursar=findBursar(signatories)
      const officerValue=schoolOfficerTokenValue(normalized,schoolSettings,signatories)
      const value=officerValue||requestData[field.name]||''
      const helperText=officerValue
        ?'Diambil otomatis dari jabatan Bendahara pada Data Induk.'
        :bursar?'Data pegawai Bendahara ditemukan, tetapi nilai ini belum diisi di Data Induk. Lengkapi manual atau perbarui Data Induk.'
          :'Bendahara belum terdaftar di Data Induk. Masukkan nilainya di sini atau lengkapi Data Induk.'
      return <label className="request-field-automatic" key={field.name}>{field.label}<input required={!!field.required&&!officerValue} value={value} readOnly={!!officerValue} aria-readonly={!!officerValue} onChange={event=>setRequestData(previous=>({...previous,[field.name]:event.target.value}))} placeholder="Lengkapi nama dan NIP Bendahara"/><small>{helperText}</small></label>
    }
    if(field.type==='auto_school'||SCHOOL_PROFILE_TOKEN_NAMES.has(normalized)){
      const value=schoolOfficerTokenValue(normalized,schoolSettings,signatories)||requestData[field.name]||''
      return <label className="request-field-automatic" key={field.name}>{field.label}<input value={value} readOnly aria-readonly="true" placeholder="Lengkapi di Data Induk → Sekolah & Sinkron"/><small>Diambil otomatis dari data Kepala Sekolah pada Data Induk.</small></label>
    }
    if(field.type==='auto_user'||USER_TOKEN_NAMES.has(normalized)){
      const identityValue=normalized==='nama'?myName:normalized==='nip'?myNip:myPosition
      return <label key={field.name}>{field.label}<input value={identityValue} readOnly aria-readonly="true" placeholder="Identitas akun dimuat otomatis"/></label>
    }
    if(TU_COMPLETABLE_TOKEN_NAMES.has(normalized)){
      const value=requestData[field.name]||''
      return <label className="request-field-optional" key={field.name}>{field.label}<input type={field.type==='date'?'date':'text'} value={value} onChange={event=>setRequestData(previous=>({...previous,[field.name]:event.target.value}))}/><small>Boleh dikosongkan jika belum tahu; akan dilengkapi Kepala Tata Usaha.</small></label>
    }
    if(field.type==='kepala_tu_only'||OFFICE_TOKEN_NAMES.has(normalized)){
      return <div className="letter-office-field" key={field.name}><strong>{field.label}</strong><small>{normalized==='nomor_surat'?'Akan diisi dan diterbitkan oleh Kepala Tata Usaha.':'Akan dilengkapi Kepala Tata Usaha saat menerbitkan surat.'}</small></div>
    }
    const type=personFieldType(field)
    if(!type){
      const value=requestData[field.name]||''
      const onChange=(nextValue:string)=>setRequestData(previous=>({...previous,[field.name]:nextValue}))
      if(field.type==='textarea')return <label className="span-2" key={field.name}>{field.label}{field.required?' *':''}<textarea required={!!field.required} rows={3} value={value} onChange={event=>onChange(event.target.value)}/></label>
      return <label key={field.name}>{field.label}{field.required?' *':''}<input type={field.type==='date'||field.type==='time'?field.type:'text'} required={!!field.required} value={value} onChange={event=>onChange(event.target.value)}/></label>
    }
    return <label key={field.name}>{field.label}{field.required?' *':''}<PersonPicker
      value={personFields[field.name]??null}
      personType={type}
      required={!!field.required}
      onChange={(person)=>{
        setPersonFields((previous)=>{
          const next={...previous}
          if(person)next[field.name]=person
          else delete next[field.name]
          return next
        })
        setRequestData((previous)=>({
          ...previous,
          [field.name]:person?.full_name||'',
          [`${field.name}_id`]:person?.id||'',
          [`${field.name}_identifier`]:person?.identifier||'',
          [`${field.name}_class_name`]:person?.class_name||'',
        }))
      }}
    /></label>
  }
  const stats=[
    ['Total Pengajuan',ownRequests.length,Files],['Surat Diproses',ownRequests.filter(r=>isLetterInProgress(r.status)&&!isFinalNoNumberApproval(r)).length,ClipboardCheck],
    ['Diterbitkan',ownRequests.filter(r=>r.status==='issued').length,Send],['Perlu Revisi',ownRequests.filter(r=>r.status==='revision').length,RefreshCw]
  ] as const
  const pendingDownloadCount=ownRequests.filter(request=>isRequestExpiryEligible(request)&&!request.downloaded_at).length
  const roleScopedRequests=role==='pemohon'||role==='guru_staf'?ownVisibleRequests:visibleRequests
  if(!session) return <div className="letter-app"><div className="sso-state"><div className="sso-card"><div className="brand-mark">7</div><span className="eyebrow">SUPER APP · SMAN 7 MAROS</span><h1>{sessionReady?'Sesi masuk tidak ditemukan':'Memverifikasi sesi masuk'}</h1><p>{sessionReady?error||'Persuratan menggunakan sesi login dari Super App. Kembali ke halaman utama untuk masuk.':'Memeriksa sesi Super App…'}</p>{sessionReady&&onBack&&<button className="primary" onClick={onBack}><ChevronLeft size={17}/> Kembali ke Super App</button>}</div></div></div>
  return <><div className="letter-app"><div className="app-shell">
    <header className="portal-header">
      <button className="brand brand-button" onClick={()=>setPage('dashboard')} aria-label="Buka dashboard Persuratan"><div className="brand-mark small">{schoolSettings?.logo_url&&/^https?:\/\//i.test(schoolSettings.logo_url)?<img src={schoolSettings.logo_url} alt="" width="39" height="39"/>:'7'}</div><div><b>{schoolSettings?.school_name||'SMAN 7 MAROS'}</b><small>Persuratan Digital</small></div></button>
      <div className="portal-actions">{onBack&&<button className="back-portal" onClick={onBack}><ChevronLeft size={17}/> Super App</button>}<button className="icon-btn notification" onClick={()=>setModal({type:'notifications'})} aria-label="Notifikasi"><Bell size={19}/>{notifications.some(n=>!n.is_read)&&<i/>}</button><div className="top-user"><div className="avatar">{(person?.username||session.user.email||'U')[0].toUpperCase()}</div><span><b>{person?.username||session.user.email}</b><small>{role?roleLabels[role]:person?.role||'Pengguna'}</small></span></div></div>
    </header>
    <nav className="module-nav" aria-label="Navigasi Persuratan"><div className="module-nav-label"><span>MENU MODUL</span><small>{visibleNav.length} layanan</small></div><div className="module-nav-list">{visibleNav.map(({label,icon:Icon,key})=><button key={key} className={`module-nav-item ${page===key?'active':''}`} aria-current={page===key?'page':undefined} onClick={()=>setPage(key)}><Icon size={17}/><span>{label}</span></button>)}</div></nav>
    <main className="main-area">
      <div className="section-heading"><div><span className="eyebrow">WORKSPACE · PERSURATAN DIGITAL</span><h2>{nav.find(n=>n.key===page)?.label||'Persuratan Digital'}</h2><p>{pageDescriptions[page]}</p></div><div className="heading-meta"><SchoolLetterheadPicker value={letterheadSlot} onChange={setLetterheadSlot}/><span className="module-status"><i/> Administrasi sekolah</span><span className="role-chip">{role?roleLabels[role]:person?.role||'Pengguna'}</span></div></div>
      <section className="content" key={page}>
        {loading?<div className="loading-grid"><div/><div/><div/><div/></div>:!role?<div className="setup-layout">
          <div className="setup-intro">
            <div className="setup-icon"><ShieldCheck size={25}/></div>
            <span className="setup-eyebrow">{roleSourceMigrationError?'MIGRASI ROLE':rolePermissionError?'PENYIAPAN DATABASE':sessionRateLimitError?'SESI SEMENTARA DIBATASI':'KONFIGURASI AKUN'}</span>
            <h3>{roleSourceMigrationError?'Migrasi akses peran belum diterapkan':rolePermissionError?'Izin tabel Persuratan belum diterapkan':sessionRateLimitError?'Pembaruan sesi sedang dibatasi':'Role Persuratan belum dikonfigurasi'}</h3>
            <p>{roleSourceMigrationError?'Jalankan migrasi role terbaru agar hak akses Persuratan mengikuti profil Super App secara otomatis.':rolePermissionError?'Supabase menolak akses ke tabel Persuratan. Terapkan grant tabel, lalu coba muat ulang.':sessionRateLimitError?'Supabase membatasi permintaan sesi sementara. Data yang sudah tampil dipertahankan; tunggu sebentar sebelum mencoba lagi.':'Akun Super App belum aktif atau role-nya belum memiliki akses ke Persuratan. Periksa role pada menu Pengguna Super App.'}</p>
            <button className="primary" onClick={()=>loadAll(true)} disabled={loading}><RefreshCw size={16}/> Coba lagi</button>
          </div>
          <div className="setup-details">
            {roleSourceMigrationError?<div className="setup-step"><span>01</span><div><b>Jalankan migrasi akses role</b><p>SQL akan memakai public.profiles sebagai sumber tunggal role dan menerapkan hak akses sesuai peran.</p><a className="setup-download" href="/Persuratan/supabase/003_superapp_role_access.sql" download>Unduh migrasi akses role <ChevronRight size={15}/></a></div></div>:rolePermissionError?<div className="setup-step"><span>01</span><div><b>Terapkan izin database</b><p>Di Supabase SQL Editor, jalankan skrip grant tabel Persuratan. RLS tetap membatasi akses sesuai role.</p><a className="setup-download" href="/Persuratan/supabase/002_persuratan_table_grants.sql" download>Unduh SQL izin tabel <ChevronRight size={15}/></a></div></div>:sessionRateLimitError?<div className="setup-step"><span>01</span><div><b>Tunggu pembatasan berakhir</b><p>Permintaan refresh tidak diulang terus-menerus. Sesi yang masih valid tetap digunakan.</p></div></div>:<div className="setup-step"><span>01</span><div><b>Periksa akun Super App</b><p>Hanya profil aktif dengan role yang diizinkan yang mendapat akses. Pengguna nonaktif dan pending tetap dibatasi.</p></div></div>}
            <div className="setup-step"><span>02</span><div><b>Coba muat ulang setelah perbaikan</b><p>Setelah query berhasil atau jeda rate limit selesai, tekan “Coba lagi”.</p></div></div>
            {error&&<div className="setup-error"><span>Detail error</span><code>{error}</code></div>}
          </div>
        </div>:<>
        {error&&<div className="error" role="alert">{error}</div>}
        {page==='dashboard'&&<><div className="welcome"><div><span className="eyebrow light">SUPER APP · {schoolSettings?.school_name||'SMAN 7 MAROS'}</span><h1>Persuratan Digital</h1><p>Pantau pengajuan, persetujuan, surat terbit, dan arsip administrasi sekolah dalam satu tempat.</p></div><div className="welcome-icon"><span className="welcome-art-icon"><Sparkles size={22}/></span><strong>Administrasi surat</strong><small>Terstruktur & terdokumentasi</small><span className="welcome-bars"><i/><i/><i/><i/><i/></span></div></div><div className="stat-grid">{stats.map(([label,value,Icon],i)=><div className="stat-card" style={{'--delay':`${i*70}ms`} as CSSProperties} key={label}><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={19}/></div></div><strong>{value}</strong><small>Ajuan milik Anda</small></div>)}</div>{pendingDownloadCount>0&&<div className="letter-expiry-alert" role="status"><Bell size={18}/><span><b>Segera unduh surat Anda</b>{pendingDownloadCount===1?' Ada 1 surat selesai yang belum diunduh.':' Ada '+pendingDownloadCount+' surat selesai yang belum diunduh.'} Surat dihapus otomatis 48 jam setelah diterbitkan/disetujui final.</span></div>}<div className="panel"><div className="panel-head"><div><h3>Pengajuan terbaru</h3><p>Aktivitas surat yang Anda ajukan</p></div><button className="text-btn" onClick={()=>setPage('requests')}>Lihat semua <ChevronRight size={16}/></button></div><RequestTable rows={ownRequests.slice(0,5)} onSubmit={submitRequest} onReview={review} onIssue={openIssue} onPrint={printLetter} onPreview={openPreview} onEdit={editRequest} ownerId={session.user.id} role={role} now={expiryClock}/></div></>}
        {page==='create'&&role!=='pemohon'&&<div className="request-create-layout">
          <div className="panel form-panel">
            <div className="panel-head"><div><h3>{requestDraftId?'Perbarui pengajuan surat':'Buat pengajuan surat'}</h3><p>Pilih format dan lengkapi informasi yang dibutuhkan.</p></div><FilePlus2 className="panel-symbol"/></div>
            <form onSubmit={createRequest} className="form-grid request-form">
              <label className="span-2">Format surat
                <select value={selectedTemplate} onChange={event=>{
                  const nextTemplate=activeTemplates.find(template=>template.id===event.target.value)
                  setSelectedTemplate(event.target.value)
                  setRequestData(Object.fromEntries((nextTemplate?.fields_schema||[])
                    .filter(field=>{
                      const normalized=field.name.toLocaleLowerCase('id-ID')
                      return field.type==='auto_user'||USER_TOKEN_NAMES.has(normalized)||SCHOOL_PROFILE_TOKEN_NAMES.has(normalized)||BURSAR_TOKEN_NAMES.has(normalized)
                    })
                    .map(field=>{
                      const normalized=field.name.toLocaleLowerCase('id-ID')
                      const value=SCHOOL_PROFILE_TOKEN_NAMES.has(normalized)||BURSAR_TOKEN_NAMES.has(normalized)
                        ? schoolOfficerTokenValue(normalized,schoolSettings,signatories)
                        : normalized==='nama'?myName:normalized==='nip'?myNip:myPosition
                      return [field.name,value]
                    })))
                  setPersonFields({})
                  setForm(previous=>({...previous,subject:nextTemplate?.name||''}))
                }} required>
                  <option value="">Pilih format surat</option>
                  {requestDraftId&&selectedTemplateRecord?.is_active===false&&<option value={selectedTemplateRecord.id}>{selectedTemplateRecord.name} (format nonaktif - pengajuan lama)</option>}
                  {activeTemplates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
                {!activeTemplates.length&&<small>Belum ada template aktif. Hubungi Administrator atau Operator Persuratan.</small>}
              </label>
              <div className="requester-identity-card span-2">
                <span className="requester-identity-icon"><UserRound size={18}/></span>
                <div><small>IDENTITAS PENGAJU · OTOMATIS</small><strong>{myName||'Memuat identitas...'}</strong><span>{[myNip,myPosition].filter(Boolean).join(' · ')||'Data akun terhubung melalui Data Induk'}</span></div>
              </div>
              <label className="span-2">Perihal pengajuan<input value={form.subject||''} onChange={event=>setForm(previous=>({...previous,subject:event.target.value}))} placeholder="Perihal surat" required/></label>
              {(selectedTemplateRecord?.fields_schema||[]).map(renderTemplateField)}
              {selectedTemplateRecord?.requires_principal_approval&&<p className="letter-approval-hint span-2">Format ini memerlukan persetujuan Kepala Sekolah setelah pemeriksaan Kepala Tata Usaha.</p>}
              <div className="span-2 form-actions">
                <button type="button" className="secondary" onClick={()=>setPage('requests')}>Batal</button>
                <button type="submit" className="secondary" value="draft" disabled={busy||!profileReady}>Simpan Draft</button>
                <button type="submit" className="primary" value="submit" disabled={busy||!profileReady||!selectedTemplate}>Kirim Pengajuan <Send size={16}/></button>
              </div>
            </form>
          </div>
          <aside className="panel request-live-preview">
            <div className="panel-head"><div><h3>Pratinjau surat</h3><p>Berubah langsung mengikuti isian.</p></div><span className="live-preview-badge"><i/> LIVE</span></div>
            {selectedTemplateRecord?<FitLetterPreview
              paperSize={normalizePaperSize(selectedTemplateRecord.page_settings?.size)}
              watermark="KONSEP / BELUM BERNOMOR"
              html={`${makeLetterheadHtml(schoolSettings,letterheadSlot,selectedTemplateRecord.page_settings?.logo_position||'top')}<article class="letter-template-body">${livePreviewHtml}</article>`}
              className="request-fit-preview"
            />:<div className="letter-preview-empty"><FileText size={28}/><strong>Pilih format surat</strong><span>Pratinjau dokumen akan muncul di sini.</span></div>}
          </aside>
        </div>}
        {page==='requests'&&<DataPanel title="Daftar pengajuan surat" subtitle="Pantau status dan riwayat pengajuan surat milik Anda." search={search} setSearch={setSearch} action={role!=='pemohon'?()=>setPage('create'):undefined} actionLabel="Ajukan surat"><RequestTable rows={ownVisibleRequests} onSubmit={submitRequest} onReview={review} onIssue={openIssue} onPrint={printLetter} onPreview={openPreview} onEdit={editRequest} ownerId={session.user.id} role={role} now={expiryClock}/></DataPanel>}
        {page==='approvals'&&<DataPanel title="Pemeriksaan dan persetujuan" subtitle="Tinjau pengajuan yang menunggu keputusan administratif." search={search} setSearch={setSearch}><RequestTable rows={visibleRequests.filter(request=>{
          if(!['submitted','resubmitted','in_review','approved'].includes(request.status)||isFinalNoNumberApproval(request))return false
          if(role!=='kepala_sekolah'||request.status!=='approved')return true
          return Boolean(request.letter_templates?.requires_principal_approval)
            &&!request.letter_approvals?.some(approval=>approval.approver_role==='kepala_sekolah'&&approval.decision==='approved')
        })} onSubmit={submitRequest} onReview={review} onIssue={openIssue} onPreview={openPreview} onPrint={printLetter} ownerId={session.user.id} role={role} now={expiryClock}/></DataPanel>}
        {page==='issued'&&<DataPanel title="Surat terbit" subtitle="Dokumen yang telah memperoleh nomor atau disetujui tanpa nomor." search={search} setSearch={setSearch}><RequestTable rows={roleScopedRequests.filter(r=>r.status==='issued'||isFinalNoNumberApproval(r))} onSubmit={submitRequest} onReview={review} onIssue={openIssue} onPrint={printLetter} onPreview={openPreview} ownerId={session.user.id} role={role} now={expiryClock}/></DataPanel>}
        {page==='archive'&&<DataPanel title="Arsip digital" subtitle="Arsip surat terbit dan dokumen administrasi." search={search} setSearch={setSearch}><RequestTable rows={roleScopedRequests.filter(r=>['issued','archived'].includes(r.status)||isFinalNoNumberApproval(r))} onSubmit={submitRequest} onReview={review} onIssue={openIssue} onPrint={printLetter} onPreview={openPreview} ownerId={session.user.id} role={role} now={expiryClock}/></DataPanel>}
        {page==='templates'&&<div className="panel"><div className="panel-head"><div><h3>{canManageTemplates?'Manajemen format surat':'Format surat tersedia'}</h3><p>{canManageTemplates?'Kelola, impor, dan atur template dinamis yang digunakan pada pengajuan.':'Format aktif yang dapat dipilih saat membuat pengajuan.'}</p></div>{canManageTemplates&&<button className="primary" onClick={openNewTemplate}><Upload size={17}/> Upload & Buat Format Surat</button>}</div><div className="template-grid">{(canManageTemplates?templates:activeTemplates).map(template=><div className={`template-card${template.is_active===false?' is-inactive':''}`} key={template.id}><div className="template-icon"><FileText/></div><h4>{template.name}</h4><p>{template.description||'Format surat sekolah'}</p><span className="soft-tag">{template.category?.name||'Umum'}</span>{canManageTemplates&&<div className="template-actions"><button type="button" className="secondary" onClick={()=>editTemplate(template)}><Pencil size={14}/> Edit</button><button type="button" className="secondary" onClick={()=>duplicateTemplate(template)}><Copy size={14}/> Duplikat</button>{template.is_active!==false?<button type="button" className="template-disable" onClick={()=>void deactivateTemplate(template)}><Trash2 size={14}/> Nonaktifkan</button>:<button type="button" className="secondary" onClick={()=>void activateTemplate(template)}><Check size={14}/> Aktifkan</button>}</div>}</div>)}</div>{!templates.length&&<div className="table-empty"><FileText size={25}/><b>Belum ada template di database</b><span>Administrator atau Operator dapat mengunggah format DOCX/PDF.</span></div>}</div>}
        {page==='incoming'&&<DataPanel title="Surat masuk" subtitle="Catat surat yang diterima sekolah." search={search} setSearch={setSearch} action={()=>{setForm({});setModal({type:'incoming'})}} actionLabel="Catat surat masuk"><div className="simple-list">{incoming.filter(x=>!search||`${x.external_number} ${x.sender} ${x.subject}`.toLowerCase().includes(search.toLowerCase())).map(x=><div className="simple-row" key={x.id}><div className="template-icon"><Inbox/></div><div className="grow"><b>{x.subject}</b><small>{x.external_number} · {x.sender} · {x.received_date}</small></div><span className="soft-tag">{x.follow_up_status}</span></div>)}</div></DataPanel>}
        {page==='outgoing'&&<div className="empty-state"><Mail size={36}/><h3>Surat keluar</h3><p>Surat yang diterbitkan melalui alur pengajuan otomatis tercatat pada Surat Terbit dan Arsip. Pencatatan surat keluar eksternal tersedia pada pengembangan berikutnya.</p></div>}
        {page==='dispositions'&&<div className="empty-state"><BookOpen size={36}/><h3>Disposisi surat</h3><p>Struktur data disposisi telah disiapkan. Antarmuka penugasan dan tindak lanjut perlu diaktifkan pada tahap integrasi lanjutan.</p></div>}
        </>}
      </section>
    </main>
    {toast&&<div className="toast"><Check size={17}/>{toast}</div>}
    {modal?.type==='template'&&<Modal title={editingTemplateId?'Edit Format Surat':'Upload & Buat Format Surat'} className="template-modal" close={()=>setModal(null)}>
      <form className="template-studio" onSubmit={createTemplate}>
        <div className="template-studio-fields">
          <label>Nama format<input required value={form.name||''} onChange={event=>setForm(previous=>({...previous,name:event.target.value}))}/></label>
          <label>Deskripsi<input value={form.description||''} onChange={event=>setForm(previous=>({...previous,description:event.target.value}))}/></label>
          <label>Kategori<select value={form.category_id||''} onChange={event=>setForm(previous=>({...previous,category_id:event.target.value}))}><option value="">Umum</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="template-approval-toggle"><input type="checkbox" checked={form.requires_principal_approval==='true'} onChange={event=>setForm(previous=>({...previous,requires_principal_approval:String(event.target.checked)}))}/> Memerlukan persetujuan Kepala Sekolah</label>
          <label className="template-approval-toggle"><input type="checkbox" checked={form.requires_number!=='false'} onChange={event=>setForm(previous=>({...previous,requires_number:String(event.target.checked)}))}/> Memerlukan penerbitan nomor surat</label>
          <label className="template-approval-toggle"><input type="checkbox" checked={form.is_active!=='false'} onChange={event=>setForm(previous=>({...previous,is_active:String(event.target.checked)}))}/> Format aktif dan tersedia untuk pengajuan</label>
          <label className="template-file-upload"><Upload size={17}/><span>Unggah format DOCX / PDF</span><input type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={event=>{void importTemplateFile(event.target.files?.[0]??null);event.target.value=''}}/></label>
          {templateSourceFilePath&&<small className="template-source-path">File sumber tersimpan: {templateSourceFilePath.split('/').pop()}</small>}
        </div>
        <section className="template-tagging-studio">
          <div className="template-studio-section-head"><div><strong>Tagging Studio</strong><small>Pilih teks di editor lalu sisipkan token untuk menjadikannya variabel.</small></div><Settings2 size={18}/></div>
          <div className="template-token-buttons">{['nama','NIP','jabatan','nomor_surat','tanggal_terbit','penandatangan','nip_penandatangan','perihal','lampiran','tujuan','hari_tanggal','jam','tempat','agenda'].map(token=><button type="button" key={token} onClick={()=>insertTemplateToken(token)}>{`{${token}}`}</button>)}</div>
          <div className="template-custom-token"><input value={tokenDraft} onChange={event=>setTokenDraft(event.target.value)} placeholder="nama_variabel_kustom"/><button type="button" className="secondary" onClick={()=>{const token=tokenDraft.trim().replace(/[^a-zA-Z0-9_]/g,'_');if(token){insertTemplateToken(token);setTokenDraft('')}}}>Sisipkan token kustom</button></div>
        </section>
        <div className="template-studio-workspace">
          <div className="template-editor-column">
            <label className="template-html-editor">Editor HTML surat<textarea ref={templateHtmlRef} rows={13} required value={form.html_content||''} onChange={event=>{const html=event.target.value;setForm(previous=>({...previous,html_content:html}));setTemplateFields(detectTemplateFields(html,templateFields))}} placeholder="<p>Nomor: {nomor_surat}</p><p>Hal: {perihal}</p>"/></label>
            <div className="template-schema-editor">
              <div className="template-studio-section-head"><div><strong>Skema field otomatis</strong><small>Token dalam kurung kurawal dideteksi otomatis.</small></div><span>{templateFields.length} variabel</span></div>
              {templateFields.length?templateFields.map((field,index)=><div className="template-field-schema" key={`${field.name}-${index}`}>
                <strong>{`{${field.name}}`}</strong>
                <input aria-label={`Label ${field.name}`} value={field.label} onChange={event=>updateTemplateField(index,{label:event.target.value})}/>
                <select aria-label={`Tipe ${field.name}`} value={field.type||'text'} onChange={event=>updateTemplateField(index,{type:event.target.value as TemplateField['type']})}>
                    <option value="text">Teks</option><option value="textarea">Paragraf</option><option value="date">Tanggal</option><option value="time">Waktu</option><option value="auto_user">Identitas akun</option><option value="auto_school">Data Kepala Sekolah</option><option value="kepala_tu_only">Kepala TU</option><option value="student">Pilih siswa</option><option value="teacher">Pilih guru</option>
                </select>
                  <label><input type="checkbox" checked={field.required!==false} disabled={field.type==='auto_user'||field.type==='auto_school'||field.type==='kepala_tu_only'||TU_COMPLETABLE_TOKEN_NAMES.has(field.name.toLocaleLowerCase('id-ID'))} onChange={event=>updateTemplateField(index,{required:event.target.checked})}/> Wajib</label>
              </div>):<p className="hint">Belum ada token. Sisipkan token untuk membuat field pengajuan secara otomatis.</p>}
            </div>
          </div>
          <div className="template-preview-column">
            <div className="template-studio-section-head"><div><strong>Pratinjau {normalizePaperSize(form.paper_size)}</strong><small>Kop dan isi surat mengikuti pilihan.</small></div><Eye size={18}/></div>
            <div className="template-preview-controls">
              <label><span>Ukuran kertas</span><select aria-label="Ukuran kertas pratinjau" value={normalizePaperSize(form.paper_size)} onChange={event=>setForm(previous=>({...previous,paper_size:normalizePaperSize(event.target.value)}))}><option value="A4">A4 · 210 × 297 mm</option><option value="F4">F4 / Folio · 215 × 330 mm</option></select></label>
              <label><span>Kop surat</span><select aria-label="Pilih kop surat untuk pratinjau" value={letterheadSlot} onChange={event=>setLetterheadSlot(event.target.value as LetterheadSlot)}><option value="1">Kop Surat 1</option><option value="2">Kop Surat 2</option><option value="3">Kop Surat 3</option></select></label>
              <label><span>Tampilan kop{letterheadSlot==='2'&&logoPosition!=='none'?' · Kop 2 tetap kiri-kanan':''}</span><select aria-label="Pilih tampilan kop surat" value={logoPosition} title={letterheadSlot==='2'?'Kop Surat 2 menggunakan susunan dua logo kiri-kanan.':''} onChange={event=>setLogoPosition(event.target.value as LogoPosition)}><option value="top" disabled={letterheadSlot==='2'}>Kop · logo di atas</option><option value="left" disabled={letterheadSlot==='2'}>Kop · logo di kiri</option><option value="none">Tanpa kop surat</option></select></label>
            </div>
            <FitLetterPreview paperSize={normalizePaperSize(form.paper_size)} html={`${makeLetterheadHtml(schoolSettings,letterheadSlot,logoPosition)}<article class="letter-template-body">${renderTemplateContent(form.html_content||'',{
              nama_kepala_sekolah:schoolOfficerTokenValue('nama_kepala_sekolah',schoolSettings,signatories),
              nip_kepala_sekolah:schoolOfficerTokenValue('nip_kepala_sekolah',schoolSettings,signatories),
              nama_bendahara:schoolOfficerTokenValue('nama_bendahara',schoolSettings,signatories),
              nip_bendahara:schoolOfficerTokenValue('nip_bendahara',schoolSettings,signatories),
            },templateFields)}</article>`} className="template-studio-preview"/>
          </div>
        </div>
        <div className="form-actions"><button type="button" className="secondary" onClick={()=>setModal(null)}>Batal</button><button type="submit" className="primary" disabled={busy||!canManageTemplates}>{busy?'Menyimpan...':'Simpan Format Surat'}</button></div>
      </form>
    </Modal>}
    {modal?.type==='incoming'&&<Modal title="Catat surat masuk" close={()=>setModal(null)}><form className="modal-form" onSubmit={createIncoming}><label>Nomor surat<input required value={form.external_number||''} onChange={e=>setForm({...form,external_number:e.target.value})}/></label><label>Asal surat<input required value={form.sender||''} onChange={e=>setForm({...form,sender:e.target.value})}/></label><label>Perihal<input required value={form.subject||''} onChange={e=>setForm({...form,subject:e.target.value})}/></label><label>Tanggal surat<input type="date" value={form.letter_date||''} onChange={e=>setForm({...form,letter_date:e.target.value})}/></label><label>Ringkasan<textarea rows={3} value={form.summary||''} onChange={e=>setForm({...form,summary:e.target.value})}/></label><button className="primary" disabled={busy}>Simpan surat masuk</button></form></Modal>}
    {modal?.type==='review'&&reviewRequest&&<Modal title="Review & Tindakan Surat" className="letter-action-modal" close={()=>setModal(null)}>
      <div className="letter-action-preview">{previewDocument?<FitLetterPreview paperSize={previewDocument.paperSize} watermark={previewDocument.isDraft?'KONSEP / BELUM BERNOMOR':''} html={`${previewDocument.header}<article class="letter-template-body">${previewDocument.html}</article>`}/>:<p className="muted">Pratinjau format surat tidak tersedia.</p>}</div>
      <form className="modal-form" onSubmit={submitReview}>
        <label>Tindakan
          <select value={reviewDecision} onChange={event=>setReviewDecision(event.target.value as 'approved'|'revision'|'rejected')}>
            <option value="approved">Setujui dan lanjutkan</option><option value="revision">Kembalikan untuk revisi</option><option value="rejected">Tolak pengajuan</option>
          </select>
        </label>
        <label>Catatan {reviewDecision==='approved'?'(opsional)':'(wajib)'}<textarea rows={4} required={reviewDecision!=='approved'} value={reviewNote} onChange={event=>setReviewNote(event.target.value)} placeholder={reviewDecision==='revision'?'Tuliskan bagian yang perlu diperbaiki':reviewDecision==='rejected'?'Tuliskan alasan penolakan':'Catatan untuk pemohon'}/></label>
        <button className="primary" disabled={busy}>{busy?'Menyimpan...':reviewDecision==='approved'?'Setujui Pengajuan':reviewDecision==='revision'?'Kirim untuk Revisi':'Tolak Pengajuan'}</button>
      </form>
    </Modal>}
    {modal?.type==='issue'&&issueRequest&&<Modal title="Setujui & Terbitkan Nomor Surat" className="letter-action-modal" close={()=>setModal(null)}>
      <div className="letter-action-preview">{previewDocument?<FitLetterPreview paperSize={previewDocument.paperSize} watermark={previewDocument.isDraft?'KONSEP / BELUM BERNOMOR':''} html={`${previewDocument.header}<article class="letter-template-body">${previewDocument.html}</article>`}/>:<p className="muted">Pratinjau format surat tidak tersedia.</p>}</div>
      <form className="modal-form" onSubmit={submitIssue}>
        {issueEditableFields.length>0&&<div className="letter-issue-office-fields">
          <div className="letter-issue-office-fields-heading"><strong>Hari/tanggal dan tempat</strong><small>Lengkapi sebelum menerbitkan surat. Nilai dari pemohon sudah terisi jika tersedia.</small></div>
          {issueEditableFields.map(field=><label key={field.name}>{field.label} *<input type={field.type==='date'?'date':'text'} required value={issueForm.ktu_fields[field.name]||''} onChange={event=>{
            const value=event.target.value
            setIssueForm(previous=>({...previous,ktu_fields:{...previous.ktu_fields,[field.name]:value}}))
            setPreviewRequest(previous=>previous?.id===issueRequest.id?{...previous,form_data:{...previous.form_data,[field.name]:value}}:previous)
          }}/></label>)}
        </div>}
        <label>Nomor surat<input required maxLength={160} value={issueForm.letter_number} onChange={event=>setIssueForm(previous=>({...previous,letter_number:event.target.value}))}/><small className="hint">Saran format: 421.03/001/UPT.SMA.07/MRS/DISDIK/{new Date().getFullYear()}</small></label>
        <label>Tanggal terbit<input type="date" required value={issueForm.issue_date} onChange={event=>setIssueForm(previous=>({...previous,issue_date:event.target.value}))}/></label>
        {signatories.length>0&&<label>Pilih pejabat penandatangan<select value={`${issueForm.signer_name}::${issueForm.signer_nip}`} onChange={event=>{const selected=signatories.find(item=>`${item.full_name}::${item.nip??''}`===event.target.value);if(selected)setIssueForm(previous=>({...previous,signer_name:selected.full_name,signer_position:selected.employment_status||previous.signer_position,signer_nip:selected.nip||''}))}}>{signatories.map(signer=><option key={`${signer.full_name}-${signer.nip}`} value={`${signer.full_name}::${signer.nip??''}`}>{signer.full_name} · {signer.employment_status||'Pejabat'}</option>)}</select></label>}
        <label>Nama penandatangan<input required value={issueForm.signer_name} onChange={event=>setIssueForm(previous=>({...previous,signer_name:event.target.value}))}/></label>
        <label>Jabatan penandatangan<input required value={issueForm.signer_position} onChange={event=>setIssueForm(previous=>({...previous,signer_position:event.target.value}))}/></label>
        <label>NIP penandatangan<input value={issueForm.signer_nip} onChange={event=>setIssueForm(previous=>({...previous,signer_nip:event.target.value}))}/></label>
        {!signatories.length&&<p className="hint">Daftar penandatangan belum tersedia; lengkapi data secara manual atau tambahkan data melalui Data Induk.</p>}
        <button className="primary" disabled={busy}>{busy?'Menerbitkan...':'Terbitkan Nomor Surat'}</button>
      </form>
    </Modal>}
    {modal?.type==='preview'&&previewRequest&&<Modal title="Pratinjau Surat" className="letter-preview-modal" close={()=>setModal(null)}>
      {previewDocument?<><FitLetterPreview paperSize={previewDocument.paperSize} watermark={previewDocument.isDraft?'KONSEP / BELUM BERNOMOR':''} html={`${previewDocument.header}<article class="letter-template-body">${previewDocument.html}</article>`} className="letter-modal-fit-preview"/><div className="letter-preview-actions"><button type="button" className="primary" disabled={printing||pdfBusy} onClick={handlePrintLetter}><Printer size={16}/>{printing?'Menyiapkan cetak...':'Cetak'}</button><button type="button" className="secondary" disabled={pdfBusy||printing} onClick={()=>void downloadLetterPdf(previewRequest)}><Download size={16}/>{pdfBusy?'Menyiapkan PDF...':'Simpan / Unduh PDF'}</button></div></>:<p role="alert">Konten template surat tidak tersedia.</p>}
    </Modal>}
    {modal?.type==='notifications'&&<Modal title="Notifikasi" close={()=>setModal(null)}><div className="notification-list">{notifications.length?notifications.map(notification=>{
      const relatedRequest=requests.find(request=>request.id===notification.letter_request_id)
      return <button type="button" className={`notification-row${notification.is_read?' is-read':''}`} key={notification.id} onClick={()=>void markNotificationRead(notification)}><Bell size={17}/><span><b>{notification.title}</b><p>{notification.body}</p>{relatedRequest?.requester_id===session.user.id&&<ExpiryReminder request={relatedRequest} now={expiryClock}/>}<small>{new Date(notification.created_at).toLocaleString('id-ID')}</small></span></button>
    }):<p className="muted">Belum ada notifikasi.</p>}</div></Modal>}
  </div></div>
  {printTarget&&createPortal(<div id="letter-print-portal" ref={printPortalRef} data-paper-size={printTarget.paperSize}>
    <style>{`@page{size:${printTarget.paperSize==='F4'?'215mm 330mm':'210mm 297mm'};margin:0}`}</style>
    <div className={`letter-app letter-print-app${printTarget.paperSize==='F4'?' letter-print-app-f4':''}`}>
      <div className={`letter-paper letter-paper-preview${printTarget.paperSize==='F4'?' paper-f4':''}`}>
        {printTarget.isDraft&&<span className="letter-watermark">KONSEP / BELUM BERNOMOR</span>}
        <div className="letter-document-render letter-paper-preview letter-print-content" dangerouslySetInnerHTML={{__html:`${printTarget.header}<article class="letter-template-body">${printTarget.html}</article>`}}/>
      </div>
    </div>
  </div>,document.body)}</>
}
function DataPanel({title,subtitle,search,setSearch,action,actionLabel,children}: {
  title:string; subtitle:string; search:string; setSearch:(value:string)=>void;
  action?:()=>void; actionLabel?:string; children:ReactNode;
}){return <div className="panel"><div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div>{action&&<button className="primary" onClick={action}><Plus size={17}/>{actionLabel}</button>}</div><div className="toolbar"><div className="search-box"><Search size={17}/><input placeholder="Cari nomor, perihal, atau pemohon..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div>{children}</div>}
function RequestTable({rows,onSubmit,onReview,onIssue,onPrint,onPreview,onEdit,ownerId,role,now}: {
  rows:LetterRequest[];
  onSubmit:(id:string)=>void;
  onReview:(request:LetterRequest)=>void;
  onIssue:(request:LetterRequest)=>void;
  onPrint?:(request:LetterRequest)=>void;
  onPreview?:(request:LetterRequest)=>void;
  onEdit?:(request:LetterRequest)=>void;
  ownerId:string;
  role:LetterRole|null;
  now:number;
}){
 if(!rows.length)return <div className="table-empty"><Files size={25}/><b>Belum ada data pengajuan</b><span>Data akan muncul setelah pengguna membuat pengajuan surat.</span></div>
 return <div className="table-wrap"><table><thead><tr><th>Pengajuan</th><th>Pemohon</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{rows.map(request=>{
   const isOwner=request.requester_id===ownerId
   const principalApprovalComplete=!request.letter_templates?.requires_principal_approval
     ||Boolean(request.letter_approvals?.some(approval=>approval.approver_role==='kepala_sekolah'&&approval.decision==='approved'))
   const canReview=(['submitted','resubmitted','in_review'].includes(request.status)&&['kepala_tu','administrator'].includes(role??''))
     ||(role==='kepala_sekolah'&&request.status==='approved'&&request.letter_templates?.requires_principal_approval)
   const canIssue=request.status==='approved'&&request.letter_templates?.requires_number!==false&&principalApprovalComplete&&['kepala_tu','administrator'].includes(role??'')
   return <tr key={request.id}><td><b>{request.subject}</b><small>{request.request_code}</small></td><td>{request.requester_name}<small>{request.requester_position||'—'}</small></td><td>{new Date(request.created_at).toLocaleDateString('id-ID')}</td><td><span className={`status status-${request.status}`}>{statusLabels[request.status]}</span>{request.admin_note&&<small className="request-admin-note">{request.admin_note}</small>}{isOwner&&<ExpiryReminder request={request} now={now}/>}</td><td><div className="row-actions">
     {onPreview&&<button type="button" title="Lihat surat" aria-label="Lihat surat" onClick={()=>onPreview(request)}><Eye size={16}/></button>}
     {isOwner&&role!=='pemohon'&&['draft','revision'].includes(request.status)&&onEdit&&<button type="button" title="Edit draft" aria-label="Edit draft" onClick={()=>onEdit(request)}><Pencil size={16}/></button>}
     {isOwner&&role!=='pemohon'&&['draft','revision'].includes(request.status)&&<button type="button" title="Kirim pengajuan" aria-label="Kirim pengajuan" onClick={()=>onSubmit(request.id)}><Send size={16}/></button>}
     {canReview&&<button type="button" title="Review pengajuan" aria-label="Review pengajuan" onClick={()=>onReview(request)}><ClipboardCheck size={16}/></button>}
     {canIssue&&<button type="button" className="issue-action" onClick={()=>onIssue(request)}>Terbitkan nomor</button>}
     {isRequestExpiryEligible(request)&&onPrint&&<button type="button" title="Cetak surat" aria-label="Cetak surat" onClick={()=>onPrint(request)}><Printer size={16}/></button>}
   </div></td></tr>
 })}</tbody></table></div>
}
function ExpiryReminder({request,now}:{request:LetterRequest;now:number}){
  const expiresAt=requestExpiryAt(request)
  if(expiresAt===null)return null
  const remaining=Math.max(0,expiresAt-now)
  const timeLabel=formatRemainingTime(remaining)
  const isDownloaded=Boolean(request.downloaded_at)
  const message=isDownloaded
    ?`Sudah diunduh · Terhapus otomatis dalam ${timeLabel}`
    :`Belum diunduh · Segera simpan PDF · Sisa waktu unduh: ${timeLabel}`
  return <small className={`request-expiry-reminder${isDownloaded?' is-downloaded':' is-pending'}`} title={`${message}. Pengajuan dihapus otomatis 48 jam setelah diterbitkan/disetujui final.`}>{message}</small>
}
function FitLetterPreview({paperSize,html,watermark,className=''}:{paperSize:PaperSize;html:string;watermark?:string;className?:string}){
  const stageRef=useRef<HTMLDivElement>(null)
  const [stageSize,setStageSize]=useState({width:0,height:0})
  const pages=useMemo(()=>splitLetterHtmlAtPageBreaks(html),[html])
  useEffect(()=>{
    const stage=stageRef.current
    if(!stage)return
    const observer=new ResizeObserver(([entry])=>{
      if(entry)setStageSize({width:entry.contentRect.width,height:entry.contentRect.height})
    })
    observer.observe(stage)
    return()=>observer.disconnect()
  },[])
  const widthMm=paperSize==='F4'?215:210
  const heightMm=paperSize==='F4'?330:297
  const widthPx=widthMm*96/25.4
  const heightPx=heightMm*96/25.4
  const scale=stageSize.width>0
    ?Math.min((stageSize.width-16)/widthPx,pages.length===1&&stageSize.height>0?(stageSize.height-16)/heightPx:1)
    :1
  return <div ref={stageRef} className={`letter-fit-preview${pages.length>1?' is-multipage':''} ${className}`}>
    {pages.map((pageHtml,index)=><div className="letter-fit-page" key={index}>
      {pages.length>1&&<div className="letter-page-label">Halaman {index+1}</div>}
      <div className="letter-fit-frame" style={{width:widthPx*scale,height:heightPx*scale}}>
        <div className={`letter-paper letter-fit-sheet${paperSize==='F4'?' paper-f4':''}`} style={{width:widthPx,height:heightPx,minHeight:heightPx,maxWidth:'none',margin:0,transform:`scale(${scale})`}}>
          {watermark&&<span className="letter-watermark">{watermark}</span>}
          <div className="letter-document-render letter-paper-preview" dangerouslySetInnerHTML={{__html:pageHtml}}/>
        </div>
      </div>
    </div>)}
  </div>
}

function Modal({title,close,children,className=''}: {title:string;close:()=>void;children:ReactNode;className?:string}){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className={`modal-card ${className}`}><div className="modal-head"><h3>{title}</h3><button className="icon-btn" aria-label="Tutup" onClick={close}><X size={18}/></button></div>{children}</div></div>}
