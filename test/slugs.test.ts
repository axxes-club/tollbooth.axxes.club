import { test, describe, before, after } from "node:test"
import assert from "node:assert/strict"
import { uniqueLinkSlug } from "@/lib/slugs"
import { resetTestData, sql, suiteFor } from "./helpers/db"

const SUITE = suiteFor("slugs")
const TENANT = SUITE.tenant
const skip = process.env.DATABASE_URL ? false : "DATABASE_URL not set"

describe("payment link slugs", { skip }, () => {
  before(() => resetTestData(SUITE))
  after(() => resetTestData(SUITE))

  test("a generated slug is url-safe and unambiguous", async () => {
    const slug = await uniqueLinkSlug()
    assert.match(slug, /^[a-z0-9]+$/)
    // 0/o and 1/l are excluded, so a slug read aloud or retyped is unambiguous.
    assert.ok(!/[01lo]/.test(slug), `slug ${slug} contains an easily-confused character`)
    assert.ok(slug.length >= 8)
  })

  test("a preferred slug is slugified and used when it is free", async () => {
    assert.equal(await uniqueLinkSlug("Friday Tickets"), "friday-tickets")
  })

  test("a preferred slug that is taken gets a suffix rather than failing", async () => {
    const first = await uniqueLinkSlug("taken")
    await sql().query(`insert into tollbooth_links (tenant_id, slug, name) values ($1, $2, 'a')`, [TENANT, first])
    const second = await uniqueLinkSlug("taken")
    assert.notEqual(second, first)
    assert.ok(second.startsWith("taken-"), `expected a suffixed slug, got ${second}`)
  })

  test("slugs do not collide across workspaces — a link is public", async () => {
    // Links are looked up without a tenant filter, so uniqueness has to be global.
    const slug = await uniqueLinkSlug()
    await sql().query(`insert into tollbooth_links (tenant_id, slug, name) values ($1, $2, 'a')`, [TENANT, slug])
    assert.notEqual(await uniqueLinkSlug(), slug)
  })

  test("a slug that would be empty falls back to a generated one", async () => {
    const slug = await uniqueLinkSlug("!!!")
    assert.match(slug, /^[a-z0-9]+$/)
    assert.ok(slug.length >= 8)
  })
})
