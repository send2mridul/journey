import { Compass, Map, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function LifeAtlasMobileNav({ active }: { active: "atlas" | "explore" | "circle" }) {
  return (
    <nav className="life-mobile-nav" aria-label="Primary navigation">
      <Link to="/" className={active === "atlas" ? "active" : ""}>
        <Map />
        <span>My Atlas</span>
      </Link>
      <a href="/#explore" className={active === "explore" ? "active" : ""}>
        <Compass />
        <span>Explore</span>
      </a>
      <Link to="/circle" className={active === "circle" ? "active" : ""}>
        <Users />
        <span>Circle</span>
      </Link>
    </nav>
  );
}
