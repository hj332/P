-- =====================================================================
-- 온담 AI — 0002: 학부모는 자기 말(role = 'parent')만 메시지로 넣을 수 있다
--
-- 0001 에서는 학부모가 role = 'assistant' 인 메시지도 직접 넣을 수 있었다.
-- 즉 "AI 가 이렇게 말했다"는 기록을 학부모가 꾸며낼 수 있었다.
-- AI 답변은 서버가 secret 키로만 저장한다 (5단계에서 구현).
-- Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 실행한다. 여러 번 실행해도 된다.
-- =====================================================================

drop policy if exists messages_insert on public.messages;

create policy messages_insert on public.messages for insert to authenticated
  with check (
    role = 'parent'
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.parent_id = auth.uid()
        and c.status in ('ACTIVE', 'WAITING_FOR_PARENT', 'SUMMARY_READY', 'CONSENT_PENDING')
    )
  );
