import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import '@/styles/globals.css'
import { CoachClientList } from '../../CoachClientList'
import { CoachOverview } from '../../CoachOverview'
import type { CoachManagedRelationship } from '@/lib/coaching/relationshipManagement'
import type { CoachClientSummary } from '@/lib/coaching/insights'
import { state } from './relationshipManagementActions.fixture'
const longName='María Alejandra de los Ángeles Fernández Rodríguez'
const relationships: CoachManagedRelationship[]=[
  {relationshipId:'relation-first',clientId:'client-first',clientName:longName,username:'maria.fuerza',avatarUrl:null,serviceName:'Fuerza y acondicionamiento',status:'active',startedAt:'2026-08-01T12:00:00Z',trainingConsentActive:true,trainingAccessAvailable:true},
  {relationshipId:'relation-second',clientId:'client-second',clientName:longName,username:'maria.movilidad',avatarUrl:null,serviceName:'Movilidad personalizada',status:'active',startedAt:'2026-08-02T12:00:00Z',trainingConsentActive:false,trainingAccessAvailable:false},
  {relationshipId:'relation-third',clientId:'client-third',clientName:null,username:null,avatarUrl:null,serviceName:'Acompañamiento general',status:'paused_by_platform',startedAt:'2026-08-03T12:00:00Z',trainingConsentActive:true,trainingAccessAvailable:false},
]
const clients: CoachClientSummary[]=[{relationshipId:'relation-first',clientId:'client-first',fullName:longName,avatarUrl:null,timeZone:'America/Havana',status:'active',lastProfessionalEvidenceAt:'2026-08-10T12:00:00Z',adherence:{prescribed:4,completed:1,missed:3,pending:0,adherencePercent:25},alerts:[{code:'low_adherence',message:'La adherencia reciente está por debajo del 50%.'}]}]
function Fixture() {
  const [rows,setRows]=useState(relationships)
  useEffect(()=>{const refresh=()=>setRows(relationships.filter(row=>!state.completed.includes(row.relationshipId)));window.addEventListener('management-refresh',refresh);Object.assign(window,{managementReady:true});return()=>window.removeEventListener('management-refresh',refresh)},[])
  const summary=new URLSearchParams(location.search).has('summary-failure') ? null : {counts:{pendingRequests:1,activeClients:1,pausedRelationships:1},clients}
  return <main className="mx-auto max-w-5xl space-y-8 px-4 py-6"><CoachOverview professionalName="Marina Entrenadora" management={{counts:{pendingRequests:1,activeRelationships:rows.filter(row=>row.status==='active').length,pausedRelationships:rows.filter(row=>row.status==='paused_by_platform').length},relationships:rows}} summary={summary} /><CoachClientList relationships={rows} clients={summary?.clients ?? null} viewerTimeZone="America/Havana" /></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
