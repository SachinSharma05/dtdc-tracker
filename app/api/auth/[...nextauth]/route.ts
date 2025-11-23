import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials) return null;

        const validUser = process.env.ADMIN_USER;
        const validPass = process.env.ADMIN_PASS;

        if (
          credentials.username === validUser &&
          credentials.password === validPass
        ) {
          return {
            id: "1",               // MUST BE STRING
            name: "Admin",
            email: validUser
          };
        }

        return null;
      }
    })
  ],

  session: {
    strategy: "jwt" as const,   // <-- FIX HERE
  },

  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };