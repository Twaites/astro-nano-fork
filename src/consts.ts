import type { Site, Metadata, Socials } from "@types";

export const SITE: Site = {
  NAME: "Twaites",
  NUM_POSTS_ON_HOMEPAGE: 3,
  NUM_WORKS_ON_HOMEPAGE: 2,
  NUM_PROJECTS_ON_HOMEPAGE: 3,
  LINKEDIN: "http://linkedin.com/in/twaites"
};

export const HOME: Metadata = {
  TITLE: "Home",
  DESCRIPTION: "Kory Twaites' blog and portfolio.",
};

export const ABOUT: Metadata = {
  TITLE: "About",
  DESCRIPTION: "Who is Twaites?",
};

export const BLOG: Metadata = {
  TITLE: "Blog",
  DESCRIPTION: "Writings about tech, life, career, faith and more.",
};

export const PROJECTS: Metadata = {
  TITLE: "Projects",
  DESCRIPTION: "My projects and online work.",
};

export const LOST_404: Metadata = {
  TITLE: "404: You Lost?",
  DESCRIPTION: "Uh Oh... Looks like you're lost",
};

export const SEARCH: Metadata = {
  TITLE: "Search",
  DESCRIPTION: "What are you looking for?",
};
export const SOCIALS: Socials = [
  {
    NAME: "twitter",
    HREF: "https://twitter.com/twaites",
  },
  {
    NAME: "instagram",
    HREF: "https://instagram.com/twaites",
  },
  {
    NAME: "github",
    HREF: "https://github.com/twaites"
  },
  {
    NAME: "linkedin",
    HREF: "https://linkedin.com/in/twaites/"
  },
];
