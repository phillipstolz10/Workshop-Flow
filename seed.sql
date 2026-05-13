-- WorkshopFlow seed data
-- Run this against your Supabase project to populate sample data.
-- Wipe existing data first (cascade handles children)

truncate table projects restart identity cascade;

do $$
declare
  p1 uuid := gen_random_uuid();
  p2 uuid := gen_random_uuid();

  w1 uuid := gen_random_uuid();
  w2 uuid := gen_random_uuid();
  w3 uuid := gen_random_uuid();
  w4 uuid := gen_random_uuid();

  s1 uuid := gen_random_uuid();
  s2 uuid := gen_random_uuid();
  s3 uuid := gen_random_uuid();
  s4 uuid := gen_random_uuid();
  s5 uuid := gen_random_uuid();
  s6 uuid := gen_random_uuid();
  s7 uuid := gen_random_uuid();
  s8 uuid := gen_random_uuid();
begin

  -- Projects
  insert into projects (id, name, description) values
    (p1, 'Acme Mobile App Redesign',  'Six-week engagement reimagining the Acme consumer app.'),
    (p2, 'Onboarding Research Sprint', 'Cross-functional sprint to fix the activation cliff.');

  -- Workshops for project 1
  insert into workshops (id, project_id, title, date, planned_duration, position) values
    (w1, p1, 'Discovery & Empathy',   '2026-05-14', 90,  0),
    (w2, p1, 'Ideation Sprint',       '2026-05-28', 120, 1);

  -- Workshops for project 2
  insert into workshops (id, project_id, title, date, planned_duration, position) values
    (w3, p2, 'Stakeholder Alignment', '2026-06-04', 60,  0),
    (w4, p2, 'Journey Mapping',       '2026-06-11', 90,  1);

  -- Sections for w1
  insert into sections (id, workshop_id, title, position) values
    (s1, w1, 'Opening',   0),
    (s2, w1, 'Deep dive', 1);

  -- Sections for w2
  insert into sections (id, workshop_id, title, position) values
    (s3, w2, 'Warm-up',      0),
    (s4, w2, 'Ideation',     1);

  -- Sections for w3
  insert into sections (id, workshop_id, title, position) values
    (s5, w3, 'Context setting', 0),
    (s6, w3, 'Discussion',      1);

  -- Sections for w4
  insert into sections (id, workshop_id, title, position) values
    (s7, w4, 'Mapping',   0),
    (s8, w4, 'Synthesis', 1);

  -- Blocks for s1 (Opening)
  insert into blocks (section_id, position, duration, title, description, person, material) values
    (s1, 0, 10, 'Welcome & agenda',      'Walk through the day agenda and set expectations.', 'You',     null),
    (s1, 1, 15, 'Icebreaker',            'Two truths and a lie — keeps energy high.',          'Everyone', 'Post-its'),
    (s1, 2, 10, 'Ground rules',          'Agree on how we work together in this space.',       'You',     null);

  -- Blocks for s2 (Deep dive)
  insert into blocks (section_id, position, duration, title, description, person, material) values
    (s2, 0, 20, 'Interview highlights reel', 'Watch curated 30s clips from user interviews.',  'You',     'Laptop, speaker'),
    (s2, 1, 15, 'Affinity clustering',       'Sort observations into themes on the wall.',     'Everyone', 'Post-its, markers'),
    (s2, 2, 20, 'How might we…',             'Reframe top pain points as opportunity prompts.', 'Everyone', 'Sharpies, wall');

  -- Blocks for s3 (Warm-up)
  insert into blocks (section_id, position, duration, title, description, person, material) values
    (s3, 0, 10, 'Check-in round',   'One word: how are you showing up today?',              'Everyone', null),
    (s3, 1, 15, 'Last sprint recap','Share three things learned since last session.',       'You',      'Slides'),
    (s3, 2, 10, 'Goal for today',   'Align on what success looks like for this session.',  'You',      null);

  -- Blocks for s4 (Ideation)
  insert into blocks (section_id, position, duration, title, description, person, material) values
    (s4, 0, 20, 'Crazy 8s',       'Eight rough sketches in eight minutes.',                'Everyone', 'Paper, pens'),
    (s4, 1, 15, 'Dot voting',     'Vote on the ideas you want to explore further.',       'Everyone', 'Dot stickers'),
    (s4, 2, 25, 'Concept pitch',  'Each team presents their top concept in 2 minutes.', 'Everyone', 'Whiteboard');

  -- Blocks for s5 (Context setting)
  insert into blocks (section_id, position, duration, title, description, person, material) values
    (s5, 0, 10, 'Why we are here',     'Frame the problem we are solving and why it matters.', 'You', 'Slides'),
    (s5, 1, 10, 'Data snapshot',       'Share key metrics that drove this sprint.',            'You', 'Dashboard printout'),
    (s5, 2, 10, 'Stakeholder intros',  'Brief introductions — role and stake in the outcome.', 'Everyone', null);

  -- Blocks for s6 (Discussion)
  insert into blocks (section_id, position, duration, title, description, person, material) values
    (s6, 0, 15, 'Open Q&A',        'Structured Q&A with parking lot for follow-ups.',     'Everyone', 'Sticky notes'),
    (s6, 1, 10, 'Alignment check', 'Fist-to-five vote on the proposed direction.',        'Everyone', null),
    (s6, 2, 10, 'Next steps',      'Who does what by when — capture action items live.',  'You',      'Shared doc');

  -- Blocks for s7 (Mapping)
  insert into blocks (section_id, position, duration, title, description, person, material) values
    (s7, 0, 15, 'As-is journey',  'Walk through the current user experience step by step.', 'You',      'Journey map template'),
    (s7, 1, 20, 'Pain point hunt','Mark moments of friction on the journey map.',          'Everyone', 'Red stickers'),
    (s7, 2, 15, 'Opportunity map','Overlay opportunity areas on the journey.',             'Everyone', 'Green stickers');

  -- Blocks for s8 (Synthesis)
  insert into blocks (section_id, position, duration, title, description, person, material) values
    (s8, 0, 15, 'Theme identification', 'Group pain points into 3–5 major themes.',          'Everyone', 'Post-its'),
    (s8, 1, 15, 'Prioritisation',       'Score themes by impact and feasibility.',           'Everyone', 'Scoring matrix'),
    (s8, 2, 10, 'Readout',              'Summarise findings and agree on next sprint focus.', 'You',     null);

end $$;
