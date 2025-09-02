// 1. Import utilities from `astro:content`
import { defineCollection, z } from "astro:content";

// 2. Import loader(s)
import { glob } from "astro/loaders";

// 3. Define your collection(s)
// Blog collection - uncomment and create src/content/blog directory when you want to add blog posts
// const blog = defineCollection({
//     loader: glob({
//         pattern: "**/*.md",
//         base: "./src/content/blog",
//     }),
//     schema: z.object({
//         title: z.string(),
//         date: z.string(),
//         excerpt: z.string(),
//         tags: z.array(z.string()).optional(),
//     }),
// });

// 4. Export a single `collections` object to register your collection(s)
// Uncomment the blog collection when you're ready to add blog posts
export const collections = { 
    // blog 
};
