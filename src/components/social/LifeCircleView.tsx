import {
  ArrowRight,
  Ban,
  Check,
  Search,
  Shield,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ProfileMark } from "./SocialVisuals";

export type CirclePerson = {
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  mutualConnections: number;
  requestStatus: "NONE" | "INCOMING" | "OUTGOING" | "CONNECTED";
};

export type CircleRelationship = {
  requestId: string;
  profile: CirclePerson;
  incoming: boolean;
  compare: { mine: boolean; theirs: boolean };
  atlas: { mine: boolean; theirs: boolean };
};

export type CircleData = {
  profile: {
    displayName: string | null;
    handle: string;
    discoverability: "DISCOVERABLE" | "LIMITED" | "HIDDEN";
    friendListVisibility: "ONLY_ME" | "FRIENDS";
  };
  friends: CircleRelationship[];
  incoming: CircleRelationship[];
  outgoing: CircleRelationship[];
  suggestions: CirclePerson[];
  chapterRequests: Array<{
    tagId: string;
    ownerName: string | null;
    ownerHandle: string;
    city: string;
    fromYear: number;
    toYear: number | null;
  }>;
  momentRequests: Array<{
    momentId: string;
    proposerName: string | null;
    proposerHandle: string;
    city: string;
    yearFrom: number | null;
    yearTo: number | null;
  }>;
  activities: Array<{
    type: string;
    actorName: string | null;
    actorHandle: string | null;
    createdAt: string;
  }>;
};

function PersonIdentity({ person }: { person: CirclePerson }) {
  return (
    <div className="circle-person-identity">
      <ProfileMark handle={person.handle} />
      <div>
        <strong>{person.displayName}</strong>
        <span>@{person.handle}</span>
        {person.mutualConnections > 0 ? (
          <small>
            {person.mutualConnections} mutual{" "}
            {person.mutualConnections === 1 ? "connection" : "connections"}
          </small>
        ) : null}
      </div>
    </div>
  );
}

export function IncomingRequestCard({
  relationship,
  onRespond,
}: {
  relationship: CircleRelationship;
  onRespond: (requestId: string, action: "ACCEPT" | "IGNORE" | "BLOCK") => void;
}) {
  return (
    <article className="request-card">
      <PersonIdentity person={relationship.profile} />
      <div className="request-copy">
        <p className="eyebrow">Connection request</p>
        <h3>{relationship.profile.displayName} wants to connect.</h3>
        <p>Connecting does not reveal either private Atlas.</p>
      </div>
      <div className="request-actions">
        <button
          className="primary-button compact"
          onClick={() => onRespond(relationship.requestId, "ACCEPT")}
        >
          <Check />
          Accept
        </button>
        <button
          className="outline-button compact"
          onClick={() => onRespond(relationship.requestId, "IGNORE")}
        >
          <X />
          Ignore
        </button>
        <button
          className="text-button danger"
          onClick={() => onRespond(relationship.requestId, "BLOCK")}
        >
          <Ban />
          Block
        </button>
      </div>
    </article>
  );
}

function FriendCard({
  relationship,
  onChange,
}: {
  relationship: CircleRelationship;
  onChange: (handle: string, action: "REMOVE" | "BLOCK") => void;
}) {
  const pathState =
    relationship.compare.mine && relationship.compare.theirs
      ? "Comparison ready"
      : relationship.compare.mine
        ? "Comparison requested"
        : "Connected · Atlas private";
  return (
    <article className="friend-card">
      <PersonIdentity person={relationship.profile} />
      <div className="friend-permission">
        <Shield />
        <span>{pathState}</span>
      </div>
      <Link
        to="/paths/$handle"
        params={{ handle: relationship.profile.handle }}
        className="circle-action secondary"
      >
        Our Paths <ArrowRight />
      </Link>
      <div className="friend-safety">
        <button onClick={() => onChange(relationship.profile.handle, "REMOVE")}>Remove</button>
        <button className="danger" onClick={() => onChange(relationship.profile.handle, "BLOCK")}>
          Block
        </button>
      </div>
    </article>
  );
}

export function LifeCircleView({
  data,
  searchQuery,
  searchResults,
  searching,
  onSearchQuery,
  onConnect,
  onRespond,
  onChangeConnection,
  onRespondTag,
  onRespondMoment,
}: {
  data: CircleData;
  searchQuery: string;
  searchResults: CirclePerson[];
  searching: boolean;
  onSearchQuery: (value: string) => void;
  onConnect: (handle: string) => void;
  onRespond: (requestId: string, action: "ACCEPT" | "IGNORE" | "BLOCK") => void;
  onChangeConnection: (handle: string, action: "REMOVE" | "BLOCK") => void;
  onRespondTag: (tagId: string, action: "CONFIRM" | "DECLINE") => void;
  onRespondMoment: (momentId: string, action: "CONFIRM" | "DECLINE") => void;
}) {
  const requestCount =
    data.incoming.length + data.chapterRequests.length + data.momentRequests.length;
  return (
    <main className="life-circle-page">
      <header className="circle-header">
        <Link to="/" className="circle-brand">
          Life Atlas
        </Link>
        <div>
          <span>@{data.profile.handle}</span>
          <Link to="/">My Atlas</Link>
        </div>
      </header>
      <section className="circle-hero">
        <div>
          <p className="eyebrow">Life Circle</p>
          <h1>People in your life.</h1>
          <p>Connections, shared chapters, and private path comparisons in one place.</p>
        </div>
        <ProfileMark handle={data.profile.handle} size={104} />
      </section>

      <section className="people-search-panel">
        <div className="circle-section-title">
          <div><p className="eyebrow">Find a friend</p><h2>Add by exact @username</h2></div>
          <UserPlus />
        </div>
        <div className="handle-friend-search">
          <label>
            <Search />
            <input
              value={searchQuery}
              onChange={(event) => onSearchQuery(event.target.value)}
              placeholder="@username"
              aria-label="Friend's exact Life Atlas handle"
              autoComplete="off"
            />
            <span>{searching ? "Checking…" : "Exact handle only"}</span>
          </label>
          <button className="primary-button compact" disabled={searchQuery.replace(/^@+/, '').trim().length < 2 || searching} onClick={() => onConnect(searchQuery)}>
            <UserPlus /> Add Friend
          </button>
        </div>
        {searchQuery.length >= 2 ? (
          <div className="search-result-list">
            {searchResults.length ? (
              searchResults.map((person) => (
                <div key={person.handle}>
                  <PersonIdentity person={person} />
                  <button
                    className="circle-action"
                    disabled={person.requestStatus !== "NONE"}
                    onClick={() => onConnect(person.handle)}
                  >
                    {person.requestStatus === "NONE"
                      ? "Connect"
                      : person.requestStatus === "OUTGOING"
                        ? "Request sent"
                        : person.requestStatus === "CONNECTED"
                          ? "Connected"
                          : "Review request"}
                  </button>
                </div>
              ))
            ) : !searching ? (
              <p>No permitted profile matches that exact handle.</p>
            ) : null}
          </div>
        ) : null}
        <small>
          <Shield />
          Exact-handle results never include anyone’s places, route, email, or private Atlas.
        </small>
      </section>

      <nav className="circle-section-nav" aria-label="Life Circle sections">
        <a href="#circle-friends">
          <span>Friends</span>
          <strong>{data.friends.length}</strong>
        </a>
        <a href="#circle-requests">
          <span>Requests</span>
          <strong>{requestCount}</strong>
        </a>
      </nav>

      {data.incoming.length > 0 ? (
        <section id="circle-requests" className="circle-section">
          <div className="circle-section-title">
            <div>
              <p className="eyebrow">Requests</p>
              <h2>Connection requests</h2>
            </div>
            <span>{data.incoming.length}</span>
          </div>
          <div className="request-list">
            {data.incoming.map((relationship) => (
              <IncomingRequestCard
                key={relationship.requestId}
                relationship={relationship}
                onRespond={onRespond}
              />
            ))}
          </div>
        </section>
      ) : null}

      {data.chapterRequests.length > 0 || data.momentRequests.length > 0 ? (
        <section className="circle-section">
          <div className="circle-section-title">
            <div>
              <p className="eyebrow">Atlas requests</p>
              <h2>Chapter and shared-moment approvals</h2>
            </div>
            <Shield />
          </div>
          <div className="story-request-list">
            {data.chapterRequests.map((request) => (
              <article className="story-request-card" key={request.tagId}>
                <ProfileMark handle={request.ownerHandle} />
                <div>
                  <p className="eyebrow">Chapter association</p>
                  <h3>
                    {request.ownerName || `@${request.ownerHandle}`} added you to their{" "}
                    {request.city} chapter.
                  </h3>
                  <p>
                    {request.fromYear}
                    {request.toYear ? `–${request.toYear}` : "–present"} · Private until you
                    confirm.
                  </p>
                </div>
                <div className="request-actions">
                  <button
                    className="primary-button compact"
                    onClick={() => onRespondTag(request.tagId, "CONFIRM")}
                  >
                    <Check />
                    Confirm
                  </button>
                  <button
                    className="outline-button compact"
                    onClick={() => onRespondTag(request.tagId, "DECLINE")}
                  >
                    <X />
                    Decline
                  </button>
                </div>
              </article>
            ))}
            {data.momentRequests.map((request) => (
              <article className="story-request-card" key={request.momentId}>
                <ProfileMark handle={request.proposerHandle} />
                <div>
                  <p className="eyebrow">Shared moment</p>
                  <h3>
                    {request.proposerName || `@${request.proposerHandle}`} asks whether you met in{" "}
                    {request.city}.
                  </h3>
                  <p>
                    {request.yearFrom || "Shared chapter"}
                    {request.yearTo && request.yearTo !== request.yearFrom
                      ? `–${request.yearTo}`
                      : ""}{" "}
                    · Confirmation does not publish it.
                  </p>
                </div>
                <div className="request-actions">
                  <button
                    className="primary-button compact"
                    onClick={() => onRespondMoment(request.momentId, "CONFIRM")}
                  >
                    <Check />
                    Confirm
                  </button>
                  <button
                    className="outline-button compact"
                    onClick={() => onRespondMoment(request.momentId, "DECLINE")}
                  >
                    <X />
                    Decline
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section id="circle-friends" className="circle-section">
        <div className="circle-section-title">
          <div>
            <p className="eyebrow">Friends</p>
            <h2>Your connections</h2>
          </div>
          <Users />
        </div>
        {data.friends.length ? (
          <div className="friend-grid">
            {data.friends.map((relationship) => (
              <FriendCard
                key={relationship.profile.handle}
                relationship={relationship}
                onChange={onChangeConnection}
              />
            ))}
          </div>
        ) : (
          <div className="circle-empty">
            <h3>No connections yet.</h3>
            <p>Use an exact @username above to send a private request.</p>
          </div>
        )}
      </section>
    </main>
  );
}
