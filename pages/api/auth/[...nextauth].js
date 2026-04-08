import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import dbConnect from "../../../lib/db";
import { User } from "../../../lib/schemas";

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
          hd: "vitstudent.ac.in",
        },
      },
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/login",
  },

  callbacks: {
    async signIn({ user, account, profile }) {
      // Restrict Google auth to VIT student email addresses only.
      if (account.provider === "google") {
        const email = (user?.email || "").toLowerCase().trim();
        const hostedDomain = (profile?.hd || "").toLowerCase();
        const emailVerified = profile?.email_verified === true;

        if (!emailVerified || hostedDomain !== "vitstudent.ac.in" || !email.endsWith("@vitstudent.ac.in")) {
          return false;
        }

        try {
          await dbConnect();
          const existingUser = await User.findOne({ email });

          if (!existingUser) {
            await User.create({
              name: user.name,
              email,
              image: user.image,
              provider: "google",
              college: "",
            });
          } else {
            existingUser.image = user.image;
            existingUser.name = user.name;
            await existingUser.save();
          }
        } catch (err) {
          console.error("DB error during signIn:", err);
          // Still allow sign-in even if DB save fails
        }
      }
      return true;
    },

    async jwt({ token, user, account }) {
      if (user) {
        try {
          await dbConnect();
          const dbUser = await User.findOne({ email: (user.email || token.email).toLowerCase() });
          if (dbUser) {
            token.dbId = dbUser._id.toString();
          }
        } catch (err) {
          console.error("DB error during jwt:", err);
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.dbId || token.sub;
      return session;
    },
  },
};

export default NextAuth(authOptions);
