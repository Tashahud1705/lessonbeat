-- Lessonbeat schema. Safe to run more than once.
create extension if not exists pgcrypto;

create table if not exists public.curriculum_codes (
  code text primary key,
  framework text not null default 'AC9',
  band text not null,
  strand text not null,
  description text not null,
  verbatim boolean not null default true,
  sort int not null default 0
);
alter table public.curriculum_codes enable row level security;
drop policy if exists "curriculum readable by all" on public.curriculum_codes;
create policy "curriculum readable by all" on public.curriculum_codes for select using (true);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Untitled unit',
  form jsonb not null default '{}'::jsonb,
  content jsonb not null default '{}'::jsonb,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists units_user_idx on public.units(user_id, updated_at desc);
alter table public.units enable row level security;
drop policy if exists "units owner all" on public.units;
create policy "units owner all" on public.units for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "units shared read" on public.units;
create policy "units shared read" on public.units for select using (is_shared = true);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  purpose text not null default '',
  path text,
  chars int not null default 0,
  content text not null default '',
  created_at timestamptz not null default now()
);
alter table public.documents enable row level security;
drop policy if exists "documents owner all" on public.documents;
create policy "documents owner all" on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.generations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task text not null,
  provider text not null default '',
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists generations_user_idx on public.generations(user_id, created_at desc);
create index if not exists generations_time_idx on public.generations(created_at desc);
alter table public.generations enable row level security;
drop policy if exists "generations owner read" on public.generations;
create policy "generations owner read" on public.generations for select using (auth.uid() = user_id);

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  would_pay text not null default '',
  price text not null default '',
  used_media text not null default '',
  comment text not null default '',
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "feedback owner insert" on public.feedback;
create policy "feedback owner insert" on public.feedback for insert with check (auth.uid() = user_id);
drop policy if exists "feedback owner read" on public.feedback;
create policy "feedback owner read" on public.feedback for select using (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists units_touch on public.units;
create trigger units_touch before update on public.units for each row execute function public.touch_updated_at();

grant usage on schema public to anon, authenticated;
grant select on public.curriculum_codes to anon, authenticated;
grant select, insert, update, delete on public.units to authenticated;
grant select on public.units to anon;
grant select, insert, update, delete on public.documents to authenticated;
grant select on public.generations to authenticated;
grant select, insert on public.feedback to authenticated;

insert into storage.buckets (id, name, public) values ('documents','documents', false) on conflict (id) do nothing;
drop policy if exists "documents bucket owner read" on storage.objects;
create policy "documents bucket owner read" on storage.objects for select to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "documents bucket owner write" on storage.objects;
create policy "documents bucket owner write" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "documents bucket owner delete" on storage.objects;
create policy "documents bucket owner delete" on storage.objects for delete to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

insert into public.curriculum_codes (code, band, strand, description, verbatim, sort) values
('AC9AMUFE01','Foundation','Exploring and responding','explore how and why the arts are important for people and communities',true,1),
('AC9AMUFD01','Foundation','Developing practices and skills','use play, imagination, arts knowledge, processes and/or skills to discover possibilities and develop ideas',true,2),
('AC9AMUFC01','Foundation','Creating and making','create arts works that communicate ideas',true,3),
('AC9AMUFP01','Foundation','Presenting and performing','share their arts works with audiences',true,4),
('AC9AMU2E01','Years 1-2','Exploring and responding','explore where, why and how people across cultures, communities and/or other contexts experience music',true,10),
('AC9AMU2E02','Years 1-2','Exploring and responding','explore examples of music composed and/or performed by First Nations Australians',true,11),
('AC9AMU2D01','Years 1-2','Developing practices and skills','develop listening skills and skills for singing and playing instruments',true,12),
('AC9AMU2C01','Years 1-2','Creating and making','select and combine elements of music when composing and practising music for performance',true,13),
('AC9AMU2P01','Years 1-2','Presenting and performing','sing and play music in informal settings',true,14),
('AC9AMU4E01','Years 3-4','Exploring and responding','explore where, why and how music is composed and/or performed across cultures, times, places and/or other contexts',true,20),
('AC9AMU4E02','Years 3-4','Exploring and responding','explore how First Nations Australians use music to communicate their connection to and responsibility for Country/Place',true,21),
('AC9AMU4D01','Years 3-4','Developing practices and skills','develop listening skills and skills for manipulating elements of music when singing and playing instruments',true,22),
('AC9AMU4C01','Years 3-4','Creating and making','manipulate elements of music to communicate ideas, perspectives and/or meaning when composing and practising for performance',true,23),
('AC9AMU4P01','Years 3-4','Presenting and performing','sing and play music they have learnt and/or composed in informal settings',true,24),
('AC9AMU6E01','Years 5-6','Exploring and responding','explore ways that the elements of music are combined in music across cultures, times, places and/or other contexts',true,30),
('AC9AMU6E02','Years 5-6','Exploring and responding','explore ways First Nations Australians use music to continue and revitalise culture',true,31),
('AC9AMU6D01','Years 5-6','Developing practices and skills','develop listening/aural skills and skills for manipulating elements of music to achieve expressive effects when composing, singing and playing instruments',true,32),
('AC9AMU6C01','Years 5-6','Creating and making','manipulate elements of music and use compositional devices to communicate ideas, perspectives and/or meaning when composing and practising music for performance, and notate, document and/or record the music they compose',true,33),
('AC9AMU6P01','Years 5-6','Presenting and performing','perform music in a range of forms they have learnt and/or composed in informal and/or formal settings',true,34),
('AC9AMU8E01','Years 7-8','Exploring and responding','Investigate how composers and performers use the elements of music and compositional devices in music from different cultures, times, places and contexts',false,40),
('AC9AMU8E02','Years 7-8','Exploring and responding','Investigate the diversity of music by First Nations Australians, with culturally responsive attention to Indigenous Cultural and Intellectual Property',false,41),
('AC9AMU8D01','Years 7-8','Developing practices and skills','Develop listening and aural skills and vocal or instrumental techniques for shaping the elements of music to achieve expressive effects',false,42),
('AC9AMU8D02','Years 7-8','Developing practices and skills','Reflect on their own and others'' music to guide choices about manipulating the elements of music and compositional devices',false,43),
('AC9AMU8C01','Years 7-8','Creating and making','Interpret music in a range of forms and styles, manipulating the elements of music and using relevant vocal or instrumental techniques',false,44),
('AC9AMU8C02','Years 7-8','Creating and making','Compose using the elements of music and compositional devices to communicate ideas, then notate, document or record the music',false,45),
('AC9AMU8P01','Years 7-8','Presenting and performing','Perform music using relevant vocal and/or instrumental techniques and performance skills',false,46),
('AC9AMU10E01','Years 9-10','Exploring and responding','Investigate how composers and performers use the elements of music, compositional devices and vocal or instrumental techniques across cultures, times, places and contexts',false,50),
('AC9AMU10E02','Years 9-10','Exploring and responding','Investigate how First Nations Australian performers and composers celebrate and challenge multiple perspectives of Australian identity',false,51),
('AC9AMU10D01','Years 9-10','Developing practices and skills','Develop, practise and refine listening skills and style-specific techniques to interpret music and communicate expressive effects',false,52),
('AC9AMU10D02','Years 9-10','Developing practices and skills','Reflect on their own and others'' music to inform decisions about interpreting and manipulating the elements of music and compositional devices',false,53),
('AC9AMU10C01','Years 9-10','Creating and making','Interpret music in a range of forms and styles, using style-specific techniques to communicate ideas, perspectives or meaning',false,54),
('AC9AMU10C02','Years 9-10','Creating and making','Compose music in chosen styles or forms, combining the elements of music and compositional devices, then notate or record the music',false,55),
('AC9AMU10P01','Years 9-10','Presenting and performing','Rehearse and present planned performances of learnt or composed music using relevant techniques and performance skills',false,56)
on conflict (code) do update set band=excluded.band, strand=excluded.strand, description=excluded.description, verbatim=excluded.verbatim, sort=excluded.sort;
