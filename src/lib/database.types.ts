
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "agents": {
                  Row: {
                    "capabilities": (string)[],"display_name": string,"home_url": string | null,"id": string,"launch_url_template": string | null,"prompt_format": string | null,"slug": string,"sort": number,"status": string,"vendor": string | null
                  }
                  Insert: {
                    "capabilities"?: (string)[],"display_name": string,"home_url"?: string | null,"id"?: string,"launch_url_template"?: string | null,"prompt_format"?: string | null,"slug": string,"sort"?: number,"status"?: string,"vendor"?: string | null
                  }
                  Update: {
                    "capabilities"?: (string)[],"display_name"?: string,"home_url"?: string | null,"id"?: string,"launch_url_template"?: string | null,"prompt_format"?: string | null,"slug"?: string,"sort"?: number,"status"?: string,"vendor"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "description": string | null,"emoji": string,"id": string,"name": string,"slug": string,"sort": number
                  }
                  Insert: {
                    "description"?: string | null,"emoji": string,"id"?: string,"name": string,"slug": string,"sort"?: number
                  }
                  Update: {
                    "description"?: string | null,"emoji"?: string,"id"?: string,"name"?: string,"slug"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"collection_items": {
                  Row: {
                    "collection_id": string,"playbook_id": string,"sort": number
                  }
                  Insert: {
                    "collection_id": string,"playbook_id": string,"sort"?: number
                  }
                  Update: {
                    "collection_id"?: string,"playbook_id"?: string,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "collection_items_collection_id_fkey"
      columns: ["collection_id"]
isOneToOne: false
      referencedRelation: "collections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_items_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: false
      referencedRelation: "playbooks"
      referencedColumns: ["id"]
    }
                  ]
                },"collections": {
                  Row: {
                    "blurb": string | null,"id": string,"illustration_url": string | null,"is_featured": boolean,"slug": string,"sort": number,"title": string
                  }
                  Insert: {
                    "blurb"?: string | null,"id"?: string,"illustration_url"?: string | null,"is_featured"?: boolean,"slug": string,"sort"?: number,"title": string
                  }
                  Update: {
                    "blurb"?: string | null,"id"?: string,"illustration_url"?: string | null,"is_featured"?: boolean,"slug"?: string,"sort"?: number,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"feedback": {
                  Row: {
                    "created_at": string,"email": string | null,"id": string,"message": string,"pathname": string | null,"status": string,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"message": string,"pathname"?: string | null,"status"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"message"?: string,"pathname"?: string | null,"status"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"followups": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"due_at": string,"id": string,"playbook_id": string,"sent_at": string | null,"try_event_id": string | null,"user_id": string
                  }
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"due_at": string,"id"?: string,"playbook_id": string,"sent_at"?: string | null,"try_event_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"due_at"?: string,"id"?: string,"playbook_id"?: string,"sent_at"?: string | null,"try_event_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "followups_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: false
      referencedRelation: "playbooks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "followups_try_event_id_fkey"
      columns: ["try_event_id"]
isOneToOne: false
      referencedRelation: "try_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "followups_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"outcome_reports": {
                  Row: {
                    "agent_id": string | null,"amount": number | null,"created_at": string,"hours_saved": number | null,"id": string,"is_outlier": boolean,"is_verified": boolean,"note": string | null,"playbook_id": string,"provider": string | null,"referral_code": string | null,"region": string | null,"result": string,"status": string,"time_spent_bucket": string | null,"unit": string | null,"updated_at": string,"user_id": string,"version_id": string,"weight": number
                  }
                  Insert: {
                    "agent_id"?: string | null,"amount"?: number | null,"created_at"?: string,"hours_saved"?: number | null,"id"?: string,"is_outlier"?: boolean,"is_verified"?: boolean,"note"?: string | null,"playbook_id": string,"provider"?: string | null,"referral_code"?: string | null,"region"?: string | null,"result": string,"status"?: string,"time_spent_bucket"?: string | null,"unit"?: string | null,"updated_at"?: string,"user_id": string,"version_id": string,"weight"?: number
                  }
                  Update: {
                    "agent_id"?: string | null,"amount"?: number | null,"created_at"?: string,"hours_saved"?: number | null,"id"?: string,"is_outlier"?: boolean,"is_verified"?: boolean,"note"?: string | null,"playbook_id"?: string,"provider"?: string | null,"referral_code"?: string | null,"region"?: string | null,"result"?: string,"status"?: string,"time_spent_bucket"?: string | null,"unit"?: string | null,"updated_at"?: string,"user_id"?: string,"version_id"?: string,"weight"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "outcome_reports_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outcome_reports_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: false
      referencedRelation: "playbooks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outcome_reports_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outcome_reports_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "playbook_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"playbook_agents": {
                  Row: {
                    "agent_id": string,"notes": string | null,"playbook_id": string,"tested": boolean
                  }
                  Insert: {
                    "agent_id": string,"notes"?: string | null,"playbook_id": string,"tested"?: boolean
                  }
                  Update: {
                    "agent_id"?: string,"notes"?: string | null,"playbook_id"?: string,"tested"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "playbook_agents_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "playbook_agents_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: false
      referencedRelation: "playbooks"
      referencedColumns: ["id"]
    }
                  ]
                },"playbook_inputs": {
                  Row: {
                    "help": string | null,"id": string,"key": string,"label": string,"options": NonNullable<Json>,"required": boolean,"sort": number,"type": string,"version_id": string,"why_it_helps": string | null
                  }
                  Insert: {
                    "help"?: string | null,"id"?: string,"key": string,"label": string,"options"?: NonNullable<Json>,"required"?: boolean,"sort"?: number,"type": string,"version_id": string,"why_it_helps"?: string | null
                  }
                  Update: {
                    "help"?: string | null,"id"?: string,"key"?: string,"label"?: string,"options"?: NonNullable<Json>,"required"?: boolean,"sort"?: number,"type"?: string,"version_id"?: string,"why_it_helps"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "playbook_inputs_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "playbook_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"playbook_requests": {
                  Row: {
                    "created_at": string,"email": string | null,"id": string,"pathname": string | null,"purpose": string | null,"query": string,"topic": string | null,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"pathname"?: string | null,"purpose"?: string | null,"query": string,"topic"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"id"?: string,"pathname"?: string | null,"purpose"?: string | null,"query"?: string,"topic"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "playbook_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"playbook_sources": {
                  Row: {
                    "handle": string | null,"id": string,"platform": string,"playbook_id": string,"title": string | null,"url": string | null
                  }
                  Insert: {
                    "handle"?: string | null,"id"?: string,"platform": string,"playbook_id": string,"title"?: string | null,"url"?: string | null
                  }
                  Update: {
                    "handle"?: string | null,"id"?: string,"platform"?: string,"playbook_id"?: string,"title"?: string | null,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "playbook_sources_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: false
      referencedRelation: "playbooks"
      referencedColumns: ["id"]
    }
                  ]
                },"playbook_stats": {
                  Row: {
                    "amount_n": number,"didnt": number,"evidence_score": number,"last_report_at": string | null,"last30_success": number | null,"median_amount": number | null,"p25": number | null,"p75": number | null,"partly": number,"playbook_id": string,"report_count": number,"success_rate_raw": number | null,"trending_score": number,"tried_count": number,"updated_at": string,"wilson_lb": number | null,"worked": number
                  }
                  Insert: {
                    "amount_n"?: number,"didnt"?: number,"evidence_score"?: number,"last_report_at"?: string | null,"last30_success"?: number | null,"median_amount"?: number | null,"p25"?: number | null,"p75"?: number | null,"partly"?: number,"playbook_id": string,"report_count"?: number,"success_rate_raw"?: number | null,"trending_score"?: number,"tried_count"?: number,"updated_at"?: string,"wilson_lb"?: number | null,"worked"?: number
                  }
                  Update: {
                    "amount_n"?: number,"didnt"?: number,"evidence_score"?: number,"last_report_at"?: string | null,"last30_success"?: number | null,"median_amount"?: number | null,"p25"?: number | null,"p75"?: number | null,"partly"?: number,"playbook_id"?: string,"report_count"?: number,"success_rate_raw"?: number | null,"trending_score"?: number,"tried_count"?: number,"updated_at"?: string,"wilson_lb"?: number | null,"worked"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "playbook_stats_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: true
      referencedRelation: "playbooks"
      referencedColumns: ["id"]
    }
                  ]
                },"playbook_steps": {
                  Row: {
                    "body": string,"id": string,"sort": number,"version_id": string
                  }
                  Insert: {
                    "body": string,"id"?: string,"sort"?: number,"version_id": string
                  }
                  Update: {
                    "body"?: string,"id"?: string,"sort"?: number,"version_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "playbook_steps_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "playbook_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"playbook_versions": {
                  Row: {
                    "changelog": string | null,"created_at": string,"id": string,"playbook_id": string,"prompt_template": string,"version": number
                  }
                  Insert: {
                    "changelog"?: string | null,"created_at"?: string,"id"?: string,"playbook_id": string,"prompt_template": string,"version": number
                  }
                  Update: {
                    "changelog"?: string | null,"created_at"?: string,"id"?: string,"playbook_id"?: string,"prompt_template"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "playbook_versions_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: false
      referencedRelation: "playbooks"
      referencedColumns: ["id"]
    }
                  ]
                },"playbooks": {
                  Row: {
                    "author_id": string | null,"category_id": string,"created_at": string,"current_version_id": string | null,"followup_days": number,"id": string,"last_verified_at": string | null,"outcome_type": string,"outcome_unit": string | null,"preview_image_url": string | null,"primary_agent_id": string | null,"promise": string,"report_fields": NonNullable<Json>,"required_capability": string,"search_tsv": unknown,"slug": string,"status": string,"tags": (string)[],"time_max": number | null,"time_min": number | null,"title": string,"updated_at": string,"who_for": string | null,"who_not_for": string | null
                  }
                  Insert: {
                    "author_id"?: string | null,"category_id": string,"created_at"?: string,"current_version_id"?: string | null,"followup_days"?: number,"id"?: string,"last_verified_at"?: string | null,"outcome_type": string,"outcome_unit"?: string | null,"preview_image_url"?: string | null,"primary_agent_id"?: string | null,"promise": string,"report_fields"?: NonNullable<Json>,"required_capability"?: string,"search_tsv"?: unknown,"slug": string,"status"?: string,"tags"?: (string)[],"time_max"?: number | null,"time_min"?: number | null,"title": string,"updated_at"?: string,"who_for"?: string | null,"who_not_for"?: string | null
                  }
                  Update: {
                    "author_id"?: string | null,"category_id"?: string,"created_at"?: string,"current_version_id"?: string | null,"followup_days"?: number,"id"?: string,"last_verified_at"?: string | null,"outcome_type"?: string,"outcome_unit"?: string | null,"preview_image_url"?: string | null,"primary_agent_id"?: string | null,"promise"?: string,"report_fields"?: NonNullable<Json>,"required_capability"?: string,"search_tsv"?: unknown,"slug"?: string,"status"?: string,"tags"?: (string)[],"time_max"?: number | null,"time_min"?: number | null,"title"?: string,"updated_at"?: string,"who_for"?: string | null,"who_not_for"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "playbooks_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "playbooks_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "playbooks_primary_agent_id_fkey"
      columns: ["primary_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"display_name": string | null,"handle": string | null,"id": string,"role": string
                  }
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string | null,"handle"?: string | null,"id": string,"role"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string | null,"handle"?: string | null,"id"?: string,"role"?: string
                  }
                  Relationships: [
                    
                  ]
                },"referral_links": {
                  Row: {
                    "agent_id": string | null,"created_at": string,"creator_id": string,"id": string,"label": string | null,"playbook_id": string,"url": string
                  }
                  Insert: {
                    "agent_id"?: string | null,"created_at"?: string,"creator_id": string,"id"?: string,"label"?: string | null,"playbook_id": string,"url": string
                  }
                  Update: {
                    "agent_id"?: string | null,"created_at"?: string,"creator_id"?: string,"id"?: string,"label"?: string | null,"playbook_id"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "referral_links_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referral_links_creator_id_fkey"
      columns: ["creator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "referral_links_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: false
      referencedRelation: "playbooks"
      referencedColumns: ["id"]
    }
                  ]
                },"report_evidence": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"report_id": string,"review_status": string,"storage_path": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"report_id": string,"review_status"?: string,"storage_path": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"report_id"?: string,"review_status"?: string,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "report_evidence_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "outcome_reports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "report_evidence_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "public_reports"
      referencedColumns: ["id"]
    }
                  ]
                },"saves": {
                  Row: {
                    "created_at": string,"playbook_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"playbook_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"playbook_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saves_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: false
      referencedRelation: "playbooks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saves_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"try_events": {
                  Row: {
                    "action": string,"agent_id": string | null,"created_at": string,"device_id": string,"id": string,"playbook_id": string,"user_id": string | null,"version_id": string | null
                  }
                  Insert: {
                    "action": string,"agent_id"?: string | null,"created_at"?: string,"device_id": string,"id"?: string,"playbook_id": string,"user_id"?: string | null,"version_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"agent_id"?: string | null,"created_at"?: string,"device_id"?: string,"id"?: string,"playbook_id"?: string,"user_id"?: string | null,"version_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "try_events_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "try_events_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: false
      referencedRelation: "playbooks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "try_events_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "try_events_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "playbook_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"use_case_items": {
                  Row: {
                    "playbook_id": string,"sort": number,"use_case_id": string
                  }
                  Insert: {
                    "playbook_id": string,"sort"?: number,"use_case_id": string
                  }
                  Update: {
                    "playbook_id"?: string,"sort"?: number,"use_case_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "use_case_items_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: false
      referencedRelation: "playbooks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "use_case_items_use_case_id_fkey"
      columns: ["use_case_id"]
isOneToOne: false
      referencedRelation: "use_cases"
      referencedColumns: ["id"]
    }
                  ]
                },"use_cases": {
                  Row: {
                    "description": string | null,"gradient_from": string,"gradient_to": string,"id": string,"slug": string,"sort": number,"title": string
                  }
                  Insert: {
                    "description"?: string | null,"gradient_from": string,"gradient_to": string,"id"?: string,"slug": string,"sort"?: number,"title": string
                  }
                  Update: {
                    "description"?: string | null,"gradient_from"?: string,"gradient_to"?: string,"id"?: string,"slug"?: string,"sort"?: number,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "public_reports": {
                  Row: {
                    "agent_id": string | null,"amount": number | null,"created_at": string | null,"display_initial": string | null,"display_name": string | null,"hours_saved": number | null,"id": string | null,"is_verified": boolean | null,"note": string | null,"playbook_id": string | null,"provider": string | null,"region": string | null,"result": string | null,"time_spent_bucket": string | null,"unit": string | null,"version_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "outcome_reports_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outcome_reports_playbook_id_fkey"
      columns: ["playbook_id"]
isOneToOne: false
      referencedRelation: "playbooks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outcome_reports_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "playbook_versions"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"owns_report":
{ Args: { "p_report_id": string }; Returns: boolean
                           },
"show_limit":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"show_trgm":
{ Args: { "": string }; Returns: (string)[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
